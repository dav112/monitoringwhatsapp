-- CreateTable
CREATE TABLE "whatsapp_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "accessTokenEncrypted" TEXT,
    "phoneNumberId" TEXT,
    "businessAccountId" TEXT,
    "verifyTokenEncrypted" TEXT,
    "appSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

