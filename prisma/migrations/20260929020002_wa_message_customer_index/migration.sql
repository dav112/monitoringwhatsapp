-- CreateIndex
CREATE INDEX "whatsapp_messages_customerId_createdAt_id_idx" ON "whatsapp_messages"("customerId", "createdAt" DESC, "id" DESC);

