import type { PrismaClient } from "@/app/generated/prisma";
import cron from "node-cron";
import { GmailEmail } from "@/lib/email/GmailEmail";

/**
 * Starts a cron job that publishes posts when their scheduledAt is due.
 * Safe to call multiple times; returns a function to stop the job if needed.
 */
export function startScheduler(prisma: PrismaClient) {
  const mailer = new GmailEmail();
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
      } catch (err) {
        // skip on error, will retry next tick
      }
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
  });

  task.start();

  return () => task.stop();
}
