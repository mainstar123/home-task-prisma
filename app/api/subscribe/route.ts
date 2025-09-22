// app/api/subscribe/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { GmailEmail } from "@/lib/email/GmailEmail"; // use Gmail SMTP class
import crypto from "crypto";

const mailer = new GmailEmail();

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
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