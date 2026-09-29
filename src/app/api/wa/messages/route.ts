import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { decodeCursor, encodeCursor, type FeedMessage } from "@/lib/wa-feed";
import type { Prisma } from "@prisma/client";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const SELECT = {
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

type MessageRow = {
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
};

function toFeedMessage(r: MessageRow): FeedMessage {
  return {
    id: r.id,
    messageId: r.messageId,
    customerId: r.customerId,
    customer: r.customer
      ? {
          id: r.customer.id,
          name: r.customer.name,
          phone: r.customer.phone,
          city: r.customer.city,
          status: r.customer.status,
        }
      : null,
    messageType: r.messageType,
    content: r.content,
    direction: r.direction,
    status: r.status,
    statusDetail: r.statusDetail,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * GET /api/wa/messages — daftar pesan read-only dengan keyset pagination
 * (createdAt DESC, id DESC; memakai index direction+createdAt+id).
 * Query: limit (default 30, maks 100), after/before (cursor), customerId,
 * direction (inbound default | outbound | all). Semua role terautentikasi.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const params = req.nextUrl.searchParams;
  const rawLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;

  const directionParam = (params.get("direction") ?? "inbound").toLowerCase();
  if (!["inbound", "outbound", "all"].includes(directionParam)) {
    return apiError("direction harus inbound, outbound, atau all.", 400);
  }

  const customerId = (params.get("customerId") ?? "").trim();
  if (customerId && customerId.length > 64) {
    return apiError("customerId tidak valid.", 400);
  }

  const after = params.get("after");
  const before = params.get("before");
  if (after && before) {
    return apiError("Gunakan after atau before, tidak keduanya.", 400);
  }
  let cursor: { createdAt: Date; id: string } | null = null;
  const cursorRaw = after ?? before;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return apiError("Cursor tidak valid.", 400);
  }

  const and: Prisma.WhatsAppMessageWhereInput[] = [];
  if (directionParam !== "all") {
    and.push({ direction: directionParam === "inbound" ? "INBOUND" : "OUTBOUND" });
  }
  if (customerId) and.push({ customerId });
  if (cursor && after) {
    and.push({
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    });
  }
  if (cursor && before) {
    and.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });
  }

  try {
    const rows = await prisma.whatsAppMessage.findMany({
      where: and.length > 0 ? { AND: and } : {},
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = page.map(toFeedMessage);
    const oldest = page[page.length - 1];
    return NextResponse.json({
      data,
      pageInfo: {
        hasMore,
        // cursor untuk "load older": menunjuk ke item tertua di halaman ini
        before: oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
      },
    });
  } catch (e) {
    console.error("GET /api/wa/messages error:", e);
    return apiError("Gagal mengambil pesan.", 500);
  }
}
