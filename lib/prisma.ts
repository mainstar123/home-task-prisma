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
