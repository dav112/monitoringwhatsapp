import crypto from "node:crypto";
import { normalizePhone } from "@/lib/customer/phone";
import type { InboundMessage, StatusUpdate, WaTextMessage, WaWebhookPayload } from "./types";

function log(...args: unknown[]) {
  console.log("[WhatsApp]", ...args);
}

/**
 * Verifikasi X-Hub-Signature-256 terhadap RAW body (string, bukan hasil JSON.parse).
 * - Jika WHATSAPP_APP_SECRET belum diset → lewati (mode dev), return { ok: true, skipped: true }.
 * - Signature salah / hilang padahal secret diset → { ok: false }.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): { ok: boolean; skipped: boolean } {
  if (!appSecret) {
    log("APP_SECRET belum diset — verifikasi signature dilewati (dev).");
    return { ok: true, skipped: true };
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { ok: false, skipped: false };
  }
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return { ok: false, skipped: false };
  return { ok: crypto.timingSafeEqual(a, b), skipped: false };
}

/** Ambil isi pesan sesuai tipenya. Media belum diunduh — hanya metadata. */
function extractContent(msg: WaTextMessage): { messageType: string; content: string } {
  const type = typeof msg.type === "string" ? msg.type : "unknown";
  switch (type) {
    case "text":
      return { messageType: "text", content: msg.text?.body ?? "" };
    case "image":
      return { messageType: "image", content: msg.image?.caption ? `[gambar] ${msg.image.caption}` : "[gambar]" };
    case "audio":
      return { messageType: "audio", content: "[audio]" };
    case "video":
      return { messageType: "video", content: msg.video?.caption ? `[video] ${msg.video.caption}` : "[video]" };
    case "document":
      return {
        messageType: "document",
        content: msg.document?.filename ? `[dokumen] ${msg.document.filename}` : "[dokumen]",
      };
    case "sticker":
      return { messageType: "sticker", content: "[stiker]" };
    case "location": {
      const name = msg.location?.name ?? msg.location?.address ?? "";
      return { messageType: "location", content: name ? `[lokasi] ${name}` : "[lokasi]" };
    }
    case "contacts":
      return { messageType: "contacts", content: "[kontak]" };
    default:
      return { messageType: type, content: `[tipe pesan: ${type}]` };
  }
}

/**
 * Parse payload webhook Meta menjadi daftar pesan inbound.
 * Return kosong bila event bukan pesan (mis. statuses) — caller tetap balas 200.
 */
export function parseWebhookPayload(payload: WaWebhookPayload): InboundMessage[] {  if (!payload || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [];
  }
  const out: InboundMessage[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || value.messaging_product !== "whatsapp") continue;
      const contacts = value.contacts ?? [];
      for (const msg of value.messages ?? []) {
        const phone = normalizePhone(msg.from);
        if (!phone || typeof msg.id !== "string" || !msg.id) continue;
        const profileName =
          contacts.find((c) => c.wa_id === msg.from)?.profile?.name?.trim() || null;
        const { messageType, content } = extractContent(msg);
        const ts = Number(msg.timestamp);
        out.push({
          messageId: msg.id,
          phone,
          profileName,
          messageType,
          content,
          timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
        });
      }
    }
  }
  return out;
}

/**
 * Parse daftar status update (statuses[]) dari payload yang sama.
 * Status tak dikenal tetap dikembalikan mentah — service yang mengabaikannya.
 */
export function parseStatusUpdates(payload: WaWebhookPayload): StatusUpdate[] {
  if (!payload || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [];
  }
  const out: StatusUpdate[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || value.messaging_product !== "whatsapp") continue;
      for (const s of value.statuses ?? []) {
        if (typeof s.id !== "string" || !s.id || typeof s.status !== "string" || !s.status) {
          continue;
        }
        const ts = Number(s.timestamp);
        let errorCode: number | null = null;
        let errorMessage: string | null = null;
        const errs = Array.isArray(s.errors) ? s.errors : [];
        if (errs.length > 0) {
          const first = errs[0] as { code?: unknown; message?: unknown; error_data?: unknown };
          if (typeof first.code === "number") errorCode = first.code;
          if (typeof first.message === "string") errorMessage = first.message.slice(0, 200);
        }
        out.push({
          messageId: s.id,
          status: s.status,
          timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
          errorCode,
          errorMessage,
        });
      }
    }
  }
  return out;
}
