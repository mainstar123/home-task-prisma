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
