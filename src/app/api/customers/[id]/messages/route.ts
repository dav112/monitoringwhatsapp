import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { outboundAllowed } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { getEffectiveConfig } from "@/lib/whatsapp/config";
import { OUTBOUND_MAX_LENGTH, sendTextMessage, OutboundError } from "@/lib/whatsapp/outbound";
import { emitFeedMessage } from "@/lib/wa-events";

type Ctx = { params: Promise<{ id: string }> };

// Placeholder basi (>5 mnt tanpa messageId) dianggap gagal diam-diam → boleh dicoba ulang.
const STALE_MS = 5 * 60 * 1000;
const CLIENT_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PHONE_RE = /^62\d{8,14}$/;

function toResponse(m: {
  id: string;
  messageId: string | null;
  customerId: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    status: "NEW" | "FOLLOW_UP" | "COMPLETED";
  } | null;
  messageType: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  statusDetail: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    messageId: m.messageId,
    customerId: m.customerId,
    customer: m.customer
      ? {
          id: m.customer.id,
          name: m.customer.name,
          phone: m.customer.phone,
          city: m.customer.city,
          status: m.customer.status,
        }
      : null,
    messageType: m.messageType,
    content: m.content,
    direction: m.direction,
    status: m.status,
    statusDetail: m.statusDetail,
    createdAt: m.createdAt.toISOString(),
  };
}

const FULL_SELECT = {
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
} as const;

/**
 * POST /api/customers/[id]/messages — kirim text via WhatsApp Cloud API.
 * Auth: semua role (ADMIN/SUPERVISOR/CS). Phone SELALU dari database.
 * Idempotency: clientMessageId unique — placeholder di-insert DULU sehingga
 * balapan konkuren hanya menghasilkan 1 pengiriman ke Meta.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body bukan JSON valid.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Body request tidak valid.", 400);
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return apiError("Pesan tidak boleh kosong.", 400);
  if (content.length > OUTBOUND_MAX_LENGTH) {
    return apiError(`Pesan maksimal ${OUTBOUND_MAX_LENGTH} karakter.`, 400);
  }
  const clientMessageId =
    typeof body.clientMessageId === "string" && body.clientMessageId !== ""
      ? body.clientMessageId
      : randomUUID();
  if (!CLIENT_KEY_RE.test(clientMessageId)) {
    return apiError("clientMessageId tidak valid.", 400);
  }

  if (!outboundAllowed(auth.userId, id)) {
    return NextResponse.json(
      { error: "Terlalu banyak pesan. Tunggu sebentar sebelum mengirim lagi." },
      { status: 429 },
    );
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });
    if (!customer) return apiError("Customer tidak ditemukan.", 404);
    if (!PHONE_RE.test(customer.phone)) {
      return apiError("Nomor WhatsApp customer tidak valid.", 400);
    }

    const creds = await getEffectiveConfig();
    if (!creds.accessToken || !creds.phoneNumberId) {
      return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
    }

    // Idempotency: klaim key via placeholder SEBELUM memanggil Meta.
    const claim = await claimKey(clientMessageId, customer.id, customer.phone, content);
    if (claim === "in-flight") {
      return NextResponse.json(
        { error: "Pesan ini sedang diproses. Tunggu konfirmasi sebelum mengirim ulang." },
        { status: 409 },
      );
    }
    if (typeof claim !== "string") {
      return NextResponse.json({ data: { message: toResponse(claim.done), resent: false } });
    }

    let metaMessageId: string;
    try {
      ({ metaMessageId } = await sendTextMessage(
        { accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId },
        customer.phone,
        content,
      ));
    } catch (e) {
      await handleSendError(clientMessageId, e);
      if (e instanceof OutboundError && e.code === "TIMEOUT") {
        return NextResponse.json({ error: e.message }, { status: 504 });
      }
      const msg = e instanceof OutboundError ? e.message : "Pesan gagal dikirim. Coba lagi.";
      const code = e instanceof OutboundError && e.code === "META_REJECTED" ? 502 : 500;
      return NextResponse.json({ error: msg }, { status: code });
    }

    // Meta accepted → tulis atomik: messageId + interaksi.
    const saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppMessage.update({
        where: { clientMessageId },
        data: { messageId: metaMessageId, status: "SENT" },
        select: FULL_SELECT,
      });
      await tx.customerInteraction.create({
        data: { customerId: customer.id, type: "MESSAGE", content },
      });
      return updated;
    });

    // Emit SETELAH commit; kegagalan emit tak menggagalkan pengiriman.
    try {
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
    } catch (e) {
      console.error("[WhatsApp] Gagal broadcast SSE outbound:", e);
    }

    console.log("[WhatsApp] Outbound terkirim:", metaMessageId);
    return NextResponse.json(
      { data: { message: toResponse(saved), resent: false } },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/customers/[id]/messages error:", e);
    return apiError("Pesan gagal dikirim. Coba lagi.", 500);
  }
}

type Claim =
  | { done: NonNullable<Awaited<ReturnType<typeof readClaim>>> }
  | "claimed"
  | "in-flight";

async function readClaim(clientMessageId: string) {
  return prisma.whatsAppMessage.findUnique({
    where: { clientMessageId },
    select: { ...FULL_SELECT, createdAt: true },
  });
}

/** Klaim idempotency key. Return baris lama bila sudah selesai / masih berjalan. */
async function claimKey(
  clientMessageId: string,
  customerId: string,
  phone: string,
  content: string,
): Promise<Claim> {
  const existing = await readClaim(clientMessageId);
  if (existing) {
    if (existing.messageId) return { done: existing };
    if (Date.now() - existing.createdAt.getTime() > STALE_MS) {
      await prisma.whatsAppMessage.delete({ where: { clientMessageId } });
    } else {
      return "in-flight";
    }
  }
  try {
    await prisma.whatsAppMessage.create({
      data: {
        clientMessageId,
        customerId,
        phone,
        messageType: "text",
        content,
        direction: "OUTBOUND",
        status: "SENDING",
      },
    });
    return "claimed";
  } catch (e) {
    // Balapan: pihak lain menang klaim. Baca hasilnya, jangan kirim ke Meta.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      const raced = await readClaim(clientMessageId);
      if (raced?.messageId) return { done: raced };
      return "in-flight";
    }
    throw e;
  }
}

/**
 * Meta menolak definitif (4xx non-retryable) → hapus placeholder agar retry
 * dengan key sama bisa jalan bersih. Ambiguous (timeout/retryable) → PERTAHANKAN
 * agar retry mengembalikan 409, bukan double-send.
 */
async function handleSendError(clientMessageId: string, e: unknown): Promise<void> {
  const definitive =
    e instanceof OutboundError && e.code === "META_REJECTED" && !e.retryable;
  if (definitive) {
    try {
      await prisma.whatsAppMessage.deleteMany({
        where: { clientMessageId, messageId: null },
      });
    } catch (err) {
      console.error("[WhatsApp] Gagal bersihkan placeholder:", err);
    }
  }
}
