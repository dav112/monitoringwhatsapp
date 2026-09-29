-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "city" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_messageId_key" ON "whatsapp_messages"("messageId");

