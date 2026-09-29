import { prisma } from "@/lib/prisma";
import { detectCity } from "@/lib/customer/city-detector";
import type { InboundMessage, StatusUpdate } from "./types";
import type { MessageStatus } from "@prisma/client";

function log(...args: unknown[]) {
  console.log("[WhatsApp]", ...args);
}

export type ProcessResult =
  | { status: "saved"; customerId: string; cityDetected: string | null }
  | { status: "duplicate" };

/**
 * Proses satu pesan inbound dalam SATU transaksi Prisma:
 * 1. find/create customer by phone (baru → NEW; existing → pertahankan status/nama)
 * 2. create WhatsAppMessage (INBOUND) — messageId unique cegah duplikat balapan
 * 3. create CustomerInteraction MESSAGE
 * 4. bila kota terdeteksi & berbeda → update city + interaksi CITY_DETECTED
 */
export async function processInboundMessage(msg: InboundMessage): Promise<ProcessResult> {
  // Cek cepat idempotency sebelum transaksi.
  const existingMsg = await prisma.whatsAppMessage.findUnique({
    where: { messageId: msg.messageId },
    select: { id: true },
  });
  if (existingMsg) {
    log(`Duplikat dilewati: ${msg.messageId}`);
    return { status: "duplicate" };
  }

  const city = msg.messageType === "text" ? detectCity(msg.content) : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({ where: { phone: msg.phone } });
      const isNew = !customer;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: msg.profileName || msg.phone,
            phone: msg.phone,
            city,
            status: "NEW",
          },
        });
        log(`Customer baru tersimpan: id=${customer.id}`);
      } else {
        log(`Customer cocok: id=${customer.id}`);
        // Jangan overwrite nama dengan data kosong; isi nama bila masih placeholder nomor.
        if (msg.profileName && (customer.name === customer.phone || !customer.name.trim())) {
          customer = await tx.customer.update({
            where: { id: customer.id },
            data: { name: msg.profileName },
          });
        }
      }

      await tx.whatsAppMessage.create({
        data: {
          customerId: customer.id,
          messageId: msg.messageId,
          phone: msg.phone,
          messageType: msg.messageType,
          content: msg.content,
          direction: "INBOUND",
          createdAt: msg.timestamp,
        },
      });

      await tx.customerInteraction.create({
        data: { customerId: customer.id, type: "MESSAGE", content: msg.content || `[${msg.messageType}]` },
      });
      log(`Pesan tersimpan: ${msg.messageId} (${msg.messageType})`);

      let cityDetected: string | null = null;
      if (city && (isNew || customer.city !== city)) {
        if (!isNew) {
          await tx.customer.update({ where: { id: customer.id }, data: { city } });
        }
        await tx.customerInteraction.create({
          data: { customerId: customer.id, type: "CITY_DETECTED", content: city },
        });
        cityDetected = city;
        log(`Kota terdeteksi: ${city} (customer id=${customer.id})`);
      }

      return { customerId: customer.id, cityDetected };
    });
    return { status: "saved", ...result };
  } catch (e) {
    // Balapan webhook ganda: unique constraint messageId → anggap duplikat.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      log(`Duplikat (race) dilewati: ${msg.messageId}`);
      return { status: "duplicate" };
    }
    throw e;
  }
}

const STATUS_RANK: Record<MessageStatus, number> = {
  SENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
};

function mapRawStatus(raw: string): MessageStatus | null {
  switch (raw.trim().toLowerCase()) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "failed":
      return "FAILED";
    default:
      return null; // status tak dikenal → abaikan aman
  }
}

export type StatusResult =
  | { status: "updated"; messageStatus: MessageStatus; customerId: string }
  | { status: "ignored"; reason: "unknown-status" | "unknown-message" | "not-outbound" | "no-op" | "downgrade" | "terminal" };

/**
 * Proses satu status update: findUnique(messageId) → guard → update.
 * - Hanya OUTBOUND; inbound tak pernah dioverwrite.
 * - Tak pernah downgrade; FAILED terminal (kecuali idempoten FAILED→FAILED = no-op).
 * - Idempoten: status sama → tanpa write, tanpa side effect.
 * - Tanpa CustomerInteraction baru (anti spam timeline).
 */
export async function processStatusUpdate(update: StatusUpdate): Promise<StatusResult> {
  const next = mapRawStatus(update.status);
  if (!next) {
    log(`Status tak dikenal diabaikan: ${update.status}`);
    return { status: "ignored", reason: "unknown-status" };
  }

  const row = await prisma.whatsAppMessage.findUnique({
    where: { messageId: update.messageId },
    select: { id: true, customerId: true, direction: true, status: true },
  });
  if (!row) {
    log(`Status untuk message tak dikenal diabaikan: ${update.messageId}`);
    return { status: "ignored", reason: "unknown-message" };
  }
  if (row.direction !== "OUTBOUND") {
    log(`Status untuk pesan inbound diabaikan: ${update.messageId}`);
    return { status: "ignored", reason: "not-outbound" };
  }

  const current: MessageStatus = row.status ?? "SENDING";
  if (next === current) return { status: "ignored", reason: "no-op" };
  if (current === "FAILED") return { status: "ignored", reason: "terminal" };
  if (next === "FAILED") {
    if (current === "READ") return { status: "ignored", reason: "downgrade" };
  } else if (STATUS_RANK[next] <= STATUS_RANK[current]) {
    return { status: "ignored", reason: "downgrade" };
  }

  const detail =
    next === "FAILED" && (update.errorCode !== null || update.errorMessage)
      ? `${update.errorCode ?? "?"}: ${(update.errorMessage ?? "gagal").slice(0, 200)}`
      : null;

  await prisma.whatsAppMessage.update({
    where: { id: row.id },
    data: { status: next, statusDetail: detail },
  });
  log(`Status ${update.messageId}: ${current} → ${next}`);
  return { status: "updated", messageStatus: next, customerId: row.customerId ?? "" };
}
