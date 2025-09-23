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
