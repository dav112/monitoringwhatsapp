import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig } from "@/lib/whatsapp/config";
import { parseStatusUpdates, parseWebhookPayload, verifySignature } from "@/lib/whatsapp/webhook";
import { processInboundMessage, processStatusUpdate } from "@/lib/whatsapp/service";
import { emitFeedMessage, emitStatusEvent } from "@/lib/wa-events";
import type { WaWebhookPayload } from "@/lib/whatsapp/types";

/**
 * GET /api/wa/webhook — verifikasi webhook oleh Meta.
 * Query: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const verifyToken = (await getEffectiveConfig()).verifyToken;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    console.log("[WhatsApp] Webhook terverifikasi.");
    return new NextResponse(challenge, { status: 200 });
  }
  console.log("[WhatsApp] Verifikasi webhook GAGAL (token tidak cocok).");
  return NextResponse.json({ error: "Verifikasi webhook gagal." }, { status: 403 });
}

/**
 * POST /api/wa/webhook — event inbound dari Meta.
 * Selalu balas cepat; event valid tapi tak relevan tetap 200.
 */
export async function POST(req: NextRequest) {
  // RAW body untuk HMAC — jangan pakai hasil JSON.parse.
  const raw = await req.text();
  const { appSecret } = await getEffectiveConfig();
  const sig = req.headers.get("x-hub-signature-256");

  const check = verifySignature(raw, sig, appSecret || undefined);
  if (!check.ok) {
    console.log("[WhatsApp] Signature webhook tidak valid.");
    return NextResponse.json({ error: "Signature tidak valid." }, { status: 403 });
  }

  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(raw) as WaWebhookPayload;
  } catch {
    console.log("[WhatsApp] Body webhook bukan JSON valid.");
    return NextResponse.json({ error: "Body bukan JSON valid." }, { status: 400 });
  }

  try {
    console.log("[WhatsApp] Webhook diterima.");
    const messages = parseWebhookPayload(payload);
    for (const msg of messages) {      // Log operasional minimal: tanpa nomor/nama/isi pesan (PII).
      console.log("[WhatsApp] Pesan masuk:", msg.messageId, `(${msg.messageType})`);
      const result = await processInboundMessage(msg);
      if (result.status === "saved") {
        // Broadcast ke SSE monitoring (best-effort; kegagalan emit tak menggagalkan webhook).
        try {
          const saved = await prisma.whatsAppMessage.findUnique({
            where: { messageId: msg.messageId },
            select: {
              id: true,
              messageId: true,
              customerId: true,
              customer: {
                select: { id: true, name: true, phone: true, city: true, status: true },
              },
              messageType: true,
              content: true,
              direction: true,
              status: true,
              statusDetail: true,
              createdAt: true,
            },
          });
          if (saved) {
            emitFeedMessage({
              id: saved.id,
              messageId: saved.messageId,
              customerId: saved.customerId,
              customer: saved.customer
                ? {
                    id: saved.customer.id,
                    name: saved.customer.name,
                    phone: saved.customer.phone,
                    city: saved.customer.city,
                    status: saved.customer.status,
                  }
                : null,
              messageType: saved.messageType,
              content: saved.content,
              direction: saved.direction,
              status: saved.status,
              statusDetail: saved.statusDetail,
              createdAt: saved.createdAt.toISOString(),
            });
          }
        } catch (e) {
          console.error("[WhatsApp] Gagal broadcast SSE:", e);
        }
      }
    }
    // Status updates diproses terpisah — tak mengganggu inbound di atas.
    // Unknown ID / unknown status / bukan OUTBOUND → diabaikan aman, tetap 200.
    const statuses = parseStatusUpdates(payload);
    for (const s of statuses) {
      try {
        const result = await processStatusUpdate(s);
        if (result.status === "updated") {
          try {
            emitStatusEvent({
              type: "message_status",
              messageId: s.messageId,
              customerId: result.customerId,
              status: result.messageStatus,
            });
          } catch (e) {
            console.error("[WhatsApp] Gagal broadcast SSE status:", e);
          }
        }
      } catch {
        console.error("[WhatsApp] Gagal proses status:", s.messageId);
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[WhatsApp] Gagal memproses webhook:", e);
    return NextResponse.json({ error: "Gagal memproses webhook." }, { status: 500 });
  }
}
