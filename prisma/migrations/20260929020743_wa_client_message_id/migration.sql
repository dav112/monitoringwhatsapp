-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "clientMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_clientMessageId_key" ON "whatsapp_messages"("clientMessageId");

