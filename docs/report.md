## Newsletter App – Architecture, API, and Operations Guide

This document explains how the system is structured, how to run it, and how to extend it. It is intentionally practical and detailed so a new engineer can be productive quickly.

### Table of contents

- Overview
- Features → Requirements mapping
- Getting started (setup, env, running)
- Data model
- Architecture (modules and responsibilities)
- Core flows (publish now, schedule, subscribe/confirm)
- Scheduler & broadcasting (reliability, exactly-once)
- API reference (request/response + curl)
- Email integration & swapping providers
- Operations (deployment, scaling, observability)
- Testing strategy
- Troubleshooting
- Roadmap / future work

## Overview

Full‑stack newsletter application built with Next.js (App Router, TypeScript) and Prisma/PostgreSQL. Authors write posts in Markdown, readers view published posts, users can subscribe, posts can be scheduled, and an outbox-driven broadcaster emails all ACTIVE subscribers when a post is published.

## Features → Requirements mapping

- Author posts in Markdown with live rendering on publish
- Read-only published posts (list and per‑slug view)
- Subscribe to newsletter with email confirmation token
- Schedule posts for later publication (minute granularity)
- Broadcast email to all ACTIVE subscribers upon publish (direct or scheduled)

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL (local or hosted)

### Environment variables

Create a `.env` at project root:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/newsletter
SITE_URL=http://localhost:3000
GMAIL_USER=your@gmail.com
GMAIL_PASS=app-password
```

- DATABASE_URL: Prisma connection string to Postgres.
- SITE_URL: Canonical base URL used by server-side fetches and email links.
- GMAIL_USER / GMAIL_PASS: SMTP credentials for Nodemailer. Prefer an App Password.

### Install & run

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open `http://localhost:3000`.

## Data model

Key entities (simplified):

- Post: `DRAFT | SCHEDULED | PUBLISHED`, Markdown and rendered HTML, optional `scheduledAt`, `publishedAt`.
- Subscriber: unique email, `PENDING | ACTIVE | UNSUBSCRIBED`, optional confirm token.
- OutboxEvent: records events to be processed reliably (e.g., `PostPublished`).
- Send: delivery record per `(postId, subscriberId)` with status (`QUEUED|SENT|FAILED`) and attempts.

Prisma highlights:

```prisma
enum PostStatus { DRAFT SCHEDULED PUBLISHED }
enum SubStatus { PENDING ACTIVE UNSUBSCRIBED }

model Post {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  markdown    String
  html        String
  status      PostStatus @default(DRAFT)
  scheduledAt DateTime?
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  outboxEvents OutboxEvent[]
  sends        Send[]
}

model Subscriber {
  id        String    @id @default(cuid())
  email     String    @unique
  status    SubStatus @default(PENDING)
  token     String?   @unique
  createdAt DateTime  @default(now())
  sends     Send[]
}

model OutboxEvent {
  id        String   @id @default(cuid())
  type      String
  postId    String
  uniqueKey String   @unique
  createdAt DateTime @default(now())
  post Post @relation(fields: [postId], references: [id])
}

model Send {
  id           String   @id @default(cuid())
  postId       String
  subscriberId String
  status       String   @default("QUEUED")
  attempts     Int      @default(0)
  lastError    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  post       Post       @relation(fields: [postId], references: [id])
  subscriber Subscriber @relation(fields: [subscriberId], references: [id])
  @@unique([postId, subscriberId])
}
```

## Architecture

### App Router (UI)

- `app/posts/page.tsx`: lists published posts via `GET /api/posts`.
- `app/posts/[slug]/page.tsx`: fetches and renders a single post via `GET /api/posts/[slug]`.
- `app/posts/new/page.tsx`: authoring form; can publish now or schedule in X minutes.
- `app/subscribe/page.tsx`: subscription form.

### API routes

- `POST /api/posts`: creates a post. If `status=PUBLISHED`, sets `publishedAt` and creates `OutboxEvent(PostPublished)`.
- `GET /api/posts`: returns published posts ordered by `publishedAt desc`.
- `GET /api/posts/[slug]`: returns a single published post.
- `POST /api/subscribe`: upserts PENDING subscriber, emails confirmation link.
- `GET /api/confirm?token=...`: activates subscriber (status ACTIVE).

### Libraries

- `lib/markdown.ts`: Markdown → HTML via Marked (GFM + line breaks).
- `lib/email/GmailEmail.ts`: Nodemailer transport using Gmail.
- `lib/broadcast.ts`: processes outbox events into `Send` rows and sends queued emails.
- `lib/scheduler.ts`: every minute, publishes due scheduled posts and then calls broadcaster.
- `lib/prisma.ts`: constructs Prisma client and starts scheduler once per process.

## Core flows

### Publish now (direct)

1. Client posts `{ title, slug, markdown, status: "PUBLISHED" }`.
2. API renders Markdown → HTML, writes `Post`, sets `publishedAt`.
3. API inserts `OutboxEvent(PostPublished)` and immediately calls broadcaster.
4. Broadcaster fans out to `Send` rows and sends emails.

### Schedule for later

1. Client posts `{ status: "SCHEDULED", scheduledAt }` (UI supports "schedule in minutes").
2. Cron (every minute) publishes due posts and creates `OutboxEvent(PostPublished)`.
3. Broadcaster runs each tick to process outbox and send emails.

### Subscribe & confirm

1. `POST /api/subscribe` creates/updates subscriber with PENDING status and a token.
2. Email contains confirmation link to `GET /api/confirm?token=...`.
3. Confirm route sets subscriber to ACTIVE.

## Scheduler & broadcasting

### Exactly-once (effective) delivery

- Transactional Outbox: Create `OutboxEvent(PostPublished)` at publish time.
- Idempotent fan-out: `Send` has unique `(postId, subscriberId)`. Broadcaster uses `createMany` with `skipDuplicates` to ensure each subscriber receives at most one `Send` per post.
- Retries: On send failure, increment `attempts`, keep `QUEUED` (retry) until threshold; then `FAILED`.
- Triggers: Broadcaster runs on a cron tick and immediately after direct publish to reduce latency.

### Cron cadence

- `node-cron` every minute: publish due posts, process broadcast queue.
- Dev guard: scheduler started once in `lib/prisma.ts` to avoid duplicate jobs under HMR.

## API reference

### POST /api/posts

Create a post.

Request body

```json
{
  "title": "My Post",
  "slug": "my-post",
  "markdown": "# Hello",
  "status": "PUBLISHED" | "SCHEDULED",
  "scheduledAt": "2025-09-23T10:30:00.000Z" // optional
}
```

Response

```json
{ "id": "post_cuid" }
```

Curl

```bash
curl -X POST "$SITE_URL/api/posts" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Hello",
    "slug":"hello",
    "markdown":"**hi**",
    "status":"PUBLISHED"
  }'
```

### GET /api/posts

Returns published posts ordered by `publishedAt desc`.

### GET /api/posts/[slug]

Returns a single published post.

### POST /api/subscribe

Request body

```json
{ "email": "user@example.com" }
```

Response

```json
{ "id": "subscriber_cuid" }
```

### GET /api/confirm?token=...

Activates the subscriber.

## Email integration & swapping providers

Current: Nodemailer (Gmail). To swap providers (SendGrid/Postmark/etc.), implement a class with the same API as `GmailEmail`:

```ts
class MyProviderEmail {
  async sendEmail({
    to,
    subject,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
  }) {
    // call provider SDK/API
  }
}
```

Replace imports in `lib/broadcast.ts` and `app/api/subscribe/route.ts` to use your provider.

## Operations (deployment, scaling, observability)

### Deployment

- Small deployments: run web and scheduler in one process.
- Production-ready: split web (Next.js) and worker (scheduler/broadcaster) into separate processes/containers.
- Serverless: use a separate long-running worker (VM/Container) for cron, or a managed scheduler + queue.

### Scaling

- Database: add indices on `Post.slug`, `Send(status)`, and timestamps.
- Email throughput: cap batch size (currently 25) and add rate limiting per tick.
- Worker concurrency: parallelize send batches carefully to respect provider quotas.

### Observability

- Logs: Prisma logs and error logs in broadcaster.
- Metrics (future): send/failed counts, processing latency, backlog size.
- Alerts (future): on repeated send failures or growing queue.

## Testing strategy

- Unit tests: Markdown rendering, broadcast fan‑out logic (idempotency), email sender wrapper (mock provider).
- Integration tests: API routes with an in-memory or test Postgres.
- E2E tests: publish now and schedule flows; ensure emails are enqueued (mock transport) and content is correct.

## Troubleshooting

- No emails sending: check `GMAIL_USER/PASS`, and ensure subscribers are ACTIVE.
- Posts not sending until later: verify scheduler running; direct publish should trigger immediate broadcast.
- Duplicate emails: ensure `(postId, subscriberId)` unique constraint exists; broadcaster uses `skipDuplicates`.
- Wrong links in emails: confirm `SITE_URL` matches the public hostname.

## Roadmap / future work

- Email: branded templates, from-name, unsubscribe link, provider webhooks for opens/bounces.
- Delivery: exponential backoff, dead‑letter queue, metrics/alerts, durable queue (BullMQ/Redis) for scale.
- Editorial: drafts preview, edit workflow, time zone aware scheduling, post pagination/search.

## Code Reference

Below is the full source of key files for quick review. Refer to the repository for non‑essential assets (icons, configs).

### app/layout.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-zinc-100`}
      >
        <header className="sticky top-0 z-10 border-b bg-white/70 dark:bg-zinc-900/70 backdrop-blur">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Newsletter
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/posts" className="hover:underline">
                Posts
              </Link>
              <Link href="/posts/new" className="hover:underline">
                New
              </Link>
              <Link href="/subscribe" className="hover:underline">
                Subscribe
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
```

### app/page.tsx

```tsx
import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="font-mono list-inside list-decimal text-sm/6 text-center sm:text-left">
          <li className="mb-2 tracking-[-.01em]">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono font-semibold px-1 py-0.5 rounded">
              app/page.tsx
            </code>
            .
          </li>
          <li className="tracking-[-.01em]">
            Save and see your changes instantly.
          </li>
        </ol>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
```

### API

```ts
// app/api/posts/route.ts
import { prisma } from "@/lib/prisma";
import { render } from "@/lib/markdown";
import { NextResponse } from "next/server";
import { processBroadcastQueue } from "@/lib/broadcast";

export async function POST(req: Request) {
  const { title, slug, markdown, status, scheduledAt } = await req.json();
  const html = render(markdown || "");
  const now = new Date();

  const post = await prisma.post.create({
    data: { title, slug, markdown, html, status, scheduledAt },
  });

  // If publishing now, create outbox event
  if (status === "PUBLISHED") {
    await prisma.outboxEvent.create({
      data: {
        type: "PostPublished",
        postId: post.id,
        uniqueKey: `post:${post.id}`,
      },
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { publishedAt: now },
    });
    // Immediately process broadcasting for this publish
    await processBroadcastQueue(prisma);
  }

  return NextResponse.json({ id: post.id });
}

export async function GET() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });
  return NextResponse.json(posts);
}
```

```ts
// app/api/posts/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;

  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
  });

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(post);
}
```

```ts
// app/api/subscribe/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { GmailEmail } from "@/lib/email/GmailEmail"; // use Gmail SMTP class
import crypto from "crypto";

const mailer = new GmailEmail();

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 }
    );
  }

  // generate a unique confirmation token
  const token = crypto.randomUUID();

  // create subscriber or update existing if re-subscribing
  const sub = await prisma.subscriber.upsert({
    where: { email },
    update: { status: "PENDING", token },
    create: { email, status: "PENDING", token },
  });

  // send confirmation email
  const confirmUrl = `${process.env.SITE_URL}/api/confirm?token=${token}`;
  await mailer.sendEmail({
    to: email,
    subject: "Confirm your subscription",
    html: `<p>Click to confirm: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
  });

  return NextResponse.json({ id: sub.id });
}
```

```ts
// app/api/confirm/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const sub = await prisma.subscriber.findUnique({ where: { token } });
  if (!sub) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  await prisma.subscriber.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", token: null },
  });

  return NextResponse.json({ message: "Subscription confirmed!" });
}
```

### Pages

```tsx
// app/posts/page.tsx
import Link from "next/link";
import axios from "axios";

export default async function PostsPage() {
  const { data: posts } = await axios.get(`${process.env.SITE_URL}/api/posts`);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Posts</h1>
      <div className="grid gap-3">
        {posts.map((post: any) => (
          <Link
            key={post.id}
            href={`/posts/${post.slug}`}
            className="block rounded-md border bg-white hover:bg-gray-50 transition-colors px-4 py-3 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <div className="font-medium">{post.title}</div>
            {post.publishedAt && (
              <div className="text-xs text-gray-500 dark:text-zinc-400">
                {new Date(post.publishedAt).toLocaleString()}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// app/posts/[slug]/page.tsx
import axios from "axios";

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const { data: post } = await axios.get(
    `${process.env.SITE_URL}/api/posts/${params.slug}`
  );

  return (
    <article className="prose prose-zinc max-w-none">
      <div className="mb-4">
        <Link href="/posts" className="text-sm hover:underline">
          ← Back to posts
        </Link>
      </div>
      <h1 className="mb-2">{post.title}</h1>
      {post.publishedAt && (
        <div className="text-sm text-gray-500 dark:text-zinc-400 mb-6">
          {new Date(post.publishedAt).toLocaleString()}
        </div>
      )}
      <div className="rounded-md border bg-white p-6 dark:bg-zinc-900 dark:border-zinc-800">
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </div>
    </article>
  );
}
```

```tsx
// app/posts/new/page.tsx
"use client";

import { useState } from "react";
import axios from "axios";

export default function NewPostPage() {
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [scheduleMinutes, setScheduleMinutes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(scheduleMinutes);
    const shouldSchedule = Number.isFinite(minutes) && minutes > 0;
    const scheduledAt = shouldSchedule
      ? new Date(Date.now() + minutes * 60_000).toISOString()
      : undefined;

    await axios.post("/api/posts", {
      title,
      markdown,
      slug: title,
      status: shouldSchedule ? "SCHEDULED" : "PUBLISHED",
      ...(scheduledAt ? { scheduledAt } : {}),
    });
    setTitle("");
    setMarkdown("");
    setScheduleMinutes("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Title</label>
        <input
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Content (Markdown)</label>
        <textarea
          className="border rounded-md p-2 w-full h-48 bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="Write your post in markdown..."
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">
          Schedule in minutes (optional)
        </label>
        <input
          type="number"
          min={0}
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="e.g. 30"
          value={scheduleMinutes}
          onChange={(e) => setScheduleMinutes(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Publish / Schedule
        </button>
      </div>
    </form>
  );
}
```

```tsx
// app/subscribe/page.tsx
"use client";

import { useState } from "react";
import axios from "axios";

export default function SubscribePage() {
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await axios.post("/api/subscribe", { email });
    setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
      >
        Subscribe
      </button>
    </form>
  );
}
```

### Lib

```ts
// lib/prisma.ts
import { PrismaClient } from "@/app/generated/prisma";
import { startScheduler } from "@/lib/scheduler";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Start scheduler once per process
const globalForScheduler = global as unknown as { schedulerStarted?: boolean };
if (!globalForScheduler.schedulerStarted) {
  try {
    startScheduler(prisma);
    globalForScheduler.schedulerStarted = true;
  } catch {}
}
```

```ts
// lib/markdown.ts
import { marked } from "marked";

// Configure marked if you like
marked.setOptions({
  gfm: true, // GitHub-flavored markdown
  breaks: true, // Convert line breaks
});

export function render(markdown: string): string {
  return marked.parse(markdown) as string;
}
```

```ts
// lib/email/GmailEmail.ts
import nodemailer from "nodemailer";

export class GmailEmail {
  private transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  async sendEmail({
    to,
    subject,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
  }) {
    const info = await this.transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      html,
    });
    //console.log("Message sent: %s", info.messageId);
    return info;
  }
}
```

```ts
// lib/scheduler.ts
import type { PrismaClient } from "@/app/generated/prisma";
import cron from "node-cron";
import { processBroadcastQueue } from "@/lib/broadcast";

/**
 * Starts a cron job that publishes posts when their scheduledAt is due.
 * Safe to call multiple times; returns a function to stop the job if needed.
 */
export function startScheduler(prisma: PrismaClient) {
  // Every minute
  const task = cron.schedule("* * * * *", async () => {
    const now = new Date();

    // Find due posts
    const duePosts = await prisma.post.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { lte: now },
      },
      select: { id: true },
    });

    if (duePosts.length === 0) return;

    for (const { id } of duePosts) {
      try {
        await prisma.$transaction(async (tx) => {
          // Publish the post
          await tx.post.update({
            where: { id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });

          // Create outbox event for downstream processing
          await tx.outboxEvent.create({
            data: {
              type: "PostPublished",
              postId: id,
              uniqueKey: `post:${id}`,
            },
          });
        });
      } catch (err) {
        // Intentionally swallow errors to keep scheduler running
      }
    }

    // Process outbox + send queue every tick (covers both direct and scheduled publishes)
    await processBroadcastQueue(prisma);
  });

  task.start();

  return () => task.stop();
}
```

```ts
// lib/broadcast.ts
import type { PrismaClient } from "@/app/generated/prisma";
import { GmailEmail } from "@/lib/email/GmailEmail";

/**
 * Process outbox events and send queued emails.
 * - Expands PostPublished events into Send rows (idempotent)
 * - Sends queued emails in small batches
 */
export async function processBroadcastQueue(prisma: PrismaClient) {
  const mailer = new GmailEmail();

  // Expand outbox events into Send rows (idempotent)
  const events = await prisma.outboxEvent.findMany({
    where: { type: "PostPublished" },
    select: { id: true, postId: true },
  });

  for (const event of events) {
    try {
      await prisma.$transaction(async (tx) => {
        const subscribers = await tx.subscriber.findMany({
          where: { status: "ACTIVE" },
          select: { id: true },
        });

        if (subscribers.length > 0) {
          await tx.send.createMany({
            data: subscribers.map((s) => ({
              postId: event.postId,
              subscriberId: s.id,
              status: "QUEUED",
            })),
            skipDuplicates: true,
          });
        }

        // Remove the outbox event once expanded
        await tx.outboxEvent.delete({ where: { id: event.id } });
      });
    } catch {}
  }

  // Process queued sends
  const batchSize = 25;
  const sends = await prisma.send.findMany({
    where: { status: "QUEUED" },
    take: batchSize,
    include: { subscriber: true, post: true },
  });

  for (const send of sends) {
    try {
      await mailer.sendEmail({
        to: send.subscriber.email,
        subject: send.post.title,
        html: send.post.html,
      });
      await prisma.send.update({
        where: { id: send.id },
        data: { status: "SENT", lastError: null },
      });
    } catch (err: any) {
      const errorMessage = err?.message ?? "unknown error";
      await prisma.send.update({
        where: { id: send.id },
        data: {
          attempts: send.attempts + 1,
          lastError: errorMessage,
          status: send.attempts + 1 >= 5 ? "FAILED" : "QUEUED",
        },
      });
    }
  }
}
```

### Prisma schema

```prisma
// prisma/schema.prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init

generator client {
  provider = "prisma-client-js"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}


enum PostStatus {
  DRAFT
  SCHEDULED
  PUBLISHED
}
enum SubStatus {
  PENDING
  ACTIVE
  UNSUBSCRIBED
}

model Post {
  id          String     @id @default(cuid())
  title       String
  slug        String     @unique
  markdown    String
  html        String
  status      PostStatus @default(DRAFT)
  scheduledAt DateTime?
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  outboxEvents OutboxEvent[]
  sends        Send[]
}

model Subscriber {
  id        String    @id @default(cuid())
  email     String    @unique
  status    SubStatus @default(PENDING)
  token     String?   @unique
  createdAt DateTime  @default(now())
  sends     Send[]
}

model OutboxEvent {
  id        String   @id @default(cuid())
  type      String
  postId    String
  uniqueKey String   @unique
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id])
}

model Send {
  id           String   @id @default(cuid())
  postId       String
  subscriberId String
  status       String   @default("QUEUED")
  attempts     Int      @default(0)
  lastError    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  post       Post       @relation(fields: [postId], references: [id])
  subscriber Subscriber @relation(fields: [subscriberId], references: [id])

  @@unique([postId, subscriberId])
}
```
