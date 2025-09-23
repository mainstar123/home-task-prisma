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
