/** Tipe + helper murni untuk feed monitoring (testable, tanpa I/O). */

export interface FeedMessageCustomer {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: string;
}

export interface FeedMessage {
  id: string;
  messageId: string | null;
  customerId: string | null;
  customer: FeedMessageCustomer | null;
  messageType: string;
  content: string;
  direction: string;
  status: string | null;
  statusDetail: string | null;
  createdAt: string;
}

/** Event status ringan untuk SSE (tanpa phone/content/token). */
export interface MessageStatusEvent {
  type: "message_status";
  messageId: string;
  customerId: string;
  status: string;
}

/** Cursor stabil: base64url("ISO|id"). */
export function encodeCursor(createdAt: string | Date, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(`${iso}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep < 0) return null;
    const d = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(d.getTime()) || !id) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}

/**
 * Gabung pesan baru ke list lama: dedupe by id, urut terbaru dulu (createdAt, id).
 * Dipakai frontend agar event ganda / reconnect tidak menimbulkan duplikat.
 */
export function mergeFeedMessages(existing: FeedMessage[], incoming: FeedMessage[]): FeedMessage[] {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing];
  for (const m of incoming) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  merged.sort((a, b) => {
    const t = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (t !== 0) return t;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });
  return merged;
}

/** Label ramah untuk tipe non-text / konten kosong (anti crash UI). */
export function messagePreview(m: Pick<FeedMessage, "messageType" | "content">): string {
  const text = (m.content ?? "").trim();
  if (text) return text;
  const labels: Record<string, string> = {
    image: "Pesan image",
    audio: "Pesan audio",
    video: "Pesan video",
    document: "Pesan document",
    sticker: "Pesan stiker",
    location: "Pesan lokasi",
    contacts: "Pesan kontak",
  };
  return labels[m.messageType] ?? `Pesan ${m.messageType || "baru"}`;
}

/** Label waktu relatif id-ID sederhana. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

/** Hanya pesan milik customer aktif (untuk filter event SSE per workspace). */
export function filterByCustomer(messages: FeedMessage[], customerId: string): FeedMessage[] {
  return messages.filter((m) => m.customerId === customerId);
}

/**
 * Terapkan status update ke bubble existing (by messageId).
 * Return list baru bila ada yang berubah; list lama bila tidak (hindari render sia-sia).
 */
export function applyStatusUpdate(
  messages: FeedMessage[],
  ev: { messageId: string; status: string },
): FeedMessage[] {
  const idx = messages.findIndex((m) => m.messageId && m.messageId === ev.messageId);
  if (idx < 0) return messages;
  if (messages[idx].status === ev.status) return messages;
  const next = [...messages];
  next[idx] = { ...next[idx], status: ev.status };
  return next;
}

/** Label status lifecycle untuk bubble outbound (dengan teks, bukan warna saja). */
export function statusLabel(status: string | null): string | null {
  switch (status) {
    case "SENDING":
      return "Sending...";
    case "SENT":
      return "✓ Sent";
    case "DELIVERED":
      return "✓✓ Delivered";
    case "READ":
      return "✓✓ Read";
    case "FAILED":
      return "⚠ Failed";
    default:
      return null;
  }
}

function jakartaParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hm: `${get("hour")}.${get("minute")}`, day: get("day"), month: get("month"), year: get("year") };
}

/**
 * Timestamp chat WIB: hari ini → "09:31", kemarin → "Kemarin 09:31",
 * lain → "28 Sep 2026 09:31". ISO/database tetap source of truth.
 */
export function formatChatTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = jakartaParts(d);
  const startOf = (ts: number) => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ts));
    return new Date(`${p}T00:00:00+07:00`).getTime();
  };
  const diffDays = Math.round((startOf(now) - startOf(d.getTime())) / 86400000);
  if (diffDays <= 0) return t.hm;
  if (diffDays === 1) return `Kemarin ${t.hm}`;
  return `${t.day} ${t.month} ${t.year} ${t.hm}`;
}
