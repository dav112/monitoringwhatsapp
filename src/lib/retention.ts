import { prisma } from "@/lib/prisma";

export const RETENTION_BATCH_SIZE = 1000;

export interface RetentionCounts {
  messages: number;
  interactions: number;
}

export interface RetentionPlan extends RetentionCounts {
  days: number;
  cutoff: Date;
  dryRun: boolean;
}

/** Baca kebijakan dari env. 0 / invalid / negatif = disabled. */
export function retentionDays(): number {
  const raw = Number.parseInt(process.env.DATA_RETENTION_DAYS ?? "0", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
}

/**
 * Hitung kandidat hapus. TIDAK PERNAH menyentuh: users, settings,
 * whatsapp_config, dan TIDAK PERNAH menghapus Customer otomatis
 * (pesan lama tidak berarti customer harus hilang).
 */
export async function countRetention(cutoff: Date): Promise<RetentionCounts> {
  const [messages, interactions] = await Promise.all([
    prisma.whatsAppMessage.count({ where: { createdAt: { lt: cutoff } } }),
    prisma.customerInteraction.count({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { messages, interactions };
}

async function deleteBatch(
  model: "message" | "interaction",
  cutoff: Date,
): Promise<number> {
  if (model === "message") {
    const rows = await prisma.whatsAppMessage.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: RETENTION_BATCH_SIZE,
    });
    if (rows.length === 0) return 0;
    const res = await prisma.whatsAppMessage.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return res.count;
  }
  const rows = await prisma.customerInteraction.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: RETENTION_BATCH_SIZE,
  });
  if (rows.length === 0) return 0;
  const res = await prisma.customerInteraction.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  return res.count;
}

/**
 * Jalankan retention. Dry-run (default) hanya menghitung.
 * Apply: hapus per batch deterministik (id ASC) hingga habis.
 * Return jumlah yang (akan) dihapus. Deletion IRREVERSIBLE — backup dulu.
 */
export async function runRetention(days: number, apply: boolean): Promise<RetentionPlan> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const counts = await countRetention(cutoff);
  if (!apply) {
    return { ...counts, days, cutoff, dryRun: true };
  }
  let messages = 0;
  let interactions = 0;
  for (;;) {
    const n = await deleteBatch("message", cutoff);
    messages += n;
    if (n < RETENTION_BATCH_SIZE) break;
  }
  for (;;) {
    const n = await deleteBatch("interaction", cutoff);
    interactions += n;
    if (n < RETENTION_BATCH_SIZE) break;
  }
  return { messages, interactions, days, cutoff, dryRun: false };
}
