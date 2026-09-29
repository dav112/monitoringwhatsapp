-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "status" "MessageStatus",
ADD COLUMN     "statusDetail" TEXT;

