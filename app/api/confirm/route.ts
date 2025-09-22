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