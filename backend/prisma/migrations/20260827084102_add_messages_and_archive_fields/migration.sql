-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('MODIFICATION_REQUEST', 'DELETION_REQUEST', 'ARCHIVE_REQUEST', 'OTHER', 'BROADCAST');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'BROADCAST_RECEIVED';

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "parentId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_recipientId_isRead_idx" ON "messages"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_parentId_idx" ON "messages"("parentId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
