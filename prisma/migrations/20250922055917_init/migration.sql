-- CreateEnum
CREATE TYPE "public"."PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "public"."SubStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" "public"."PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "public"."SubStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Send" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "public"."Post"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "public"."Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_token_key" ON "public"."Subscriber"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_uniqueKey_key" ON "public"."OutboxEvent"("uniqueKey");

-- CreateIndex
CREATE UNIQUE INDEX "Send_postId_subscriberId_key" ON "public"."Send"("postId", "subscriberId");

-- AddForeignKey
ALTER TABLE "public"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Send" ADD CONSTRAINT "Send_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Send" ADD CONSTRAINT "Send_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "public"."Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
