-- CreateIndex
CREATE INDEX "whatsapp_messages_direction_createdAt_id_idx" ON "whatsapp_messages"("direction", "createdAt" DESC, "id" DESC);

