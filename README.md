## Newsletter App (Next.js + Prisma)

Full‑stack newsletter app with authoring, read‑only post views, subscriptions, scheduling, and broadcast on publish.

### Features (mapped to requirements)

- Author new posts (markdown → HTML via Marked)
- View published posts (list and per‑slug pages)
- Subscribe with email confirmation token
- Schedule posts to publish later (minute‑level cron)
- Broadcast email to subscribers on publish (direct or scheduled)

### Tech Stack

- Next.js App Router (TypeScript, SSR)
- Prisma + PostgreSQL
- Marked (Markdown rendering)
- Nodemailer (Gmail SMTP by default; pluggable)
- node-cron (scheduler)

---

## Getting Started

### Prerequisites

- Node 18+
- PostgreSQL database

### Environment

Create `.env` in project root:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/newsletter
SITE_URL=http://localhost:3000
GMAIL_USER=your@gmail.com
GMAIL_PASS=app-password-or-mock
```

Notes:

- `SITE_URL` is used for server‑side fetches and email links.
- For Gmail, use an App Password (2FA) or swap to another SMTP provider.

### Install & DB setup

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open `http://localhost:3000`.

---

## Usage

- Authoring: `GET /posts/new` → create post (optionally “schedule in minutes”).
- Read: `GET /posts` (list), `GET /posts/[slug]` (detail).
- API: `POST /api/posts`, `GET /api/posts`, `GET /api/posts/[slug]`.
- Subscribe: `POST /api/subscribe` → email confirmation link `GET /api/confirm?token=...`.

Scheduling & broadcast:

- Scheduler runs every minute. Publishes due posts and processes outbox to send emails.
- Direct publish also triggers broadcast immediately (without waiting for next tick).

---

## Architecture & Reliability

### Data models (simplified)

- Post: `DRAFT | SCHEDULED | PUBLISHED`, `scheduledAt`, `publishedAt`, `html`, `markdown`.
- Subscriber: email, `PENDING | ACTIVE | UNSUBSCRIBED`, confirmation `token`.
- OutboxEvent: `type = PostPublished`, `postId`, `uniqueKey`.
- Send: one row per subscriber delivery attempt with `status`, `attempts`, `lastError`.

### Exactly‑once (effective) delivery approach

- Transactional Outbox: on publish, create `OutboxEvent(PostPublished)`.
- Fan‑out: expand outbox into `Send` rows for all ACTIVE subscribers using `createMany` with `skipDuplicates` and unique `(postId, subscriberId)` to ensure idempotency.
- Sending: pick QUEUED sends in small batches, send email, mark `SENT`; on failure increment `attempts` and retry (eventually `FAILED`).
- Trigger points: (1) scheduler tick; (2) immediate call after direct publish.

This yields at‑least‑once sending with idempotency controls that make effective exactly‑once delivery per subscriber.

---

## Trade‑offs & Decisions

- Simplicity over infra: in‑process `node-cron` instead of an external job runner; guarded to start once in dev.
- Email via Nodemailer (Gmail) for ease; easily swappable to SendGrid/Postmark.
- Server‑side fetch uses `SITE_URL` to avoid mixed env usage; avoids exposing base URL client‑side.

---

## Improvements (future work)

- Email: branded HTML templates, from‑name, unsubscribe link, provider webhooks (opens/bounces).
- Delivery: exponential backoff, dead‑letter queue, metrics/alerts; move to a durable queue/worker (BullMQ/Redis or serverless queue).
- Editorial UX: draft preview, edit/publish workflows, time zone aware scheduler UI, pagination and search for posts.

---

## Deployment

- Recommended: separate web and worker processes (or a single long‑running service) so the scheduler/broadcast runs reliably.
- Configure env vars (`DATABASE_URL`, `SITE_URL`, SMTP creds) and run DB migrations on deploy.
- For serverless (Vercel/Netlify) use a separate worker (e.g., a small VM or container) for cron/broadcast, or platform schedulers + queue.
