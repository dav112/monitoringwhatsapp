import type { CustomerStatus, Prisma } from "@prisma/client";

export interface ExportFilters {
  search: string;
  city: string;
  status: string;
  startDate: string;
  endDate: string;
}

/** Ambil filter dari query string (mendukung alias from/to untuk kompatibilitas UI lama). */
export function filtersFromParams(params: URLSearchParams): ExportFilters {
  return {
    search: params.get("search") ?? "",
    city: params.get("city") ?? "",
    status: params.get("status") ?? "",
    startDate: params.get("startDate") ?? params.get("from") ?? "",
    endDate: params.get("endDate") ?? params.get("to") ?? "",
  };
}

const VALID_STATUS: CustomerStatus[] = ["NEW", "FOLLOW_UP", "COMPLETED"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg: string): never {
  throw new Error(msg);
}

function parseDay(s: string, label: string): Date {
  if (!DATE_RE.test(s)) fail(`${label} harus format YYYY-MM-DD.`);
  // Interpretasi eksplisit WIB (+07:00, tanpa DST) agar konsisten.
  const d = new Date(`${s}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) fail(`${label} bukan tanggal valid.`);
  return d;
}

/**
 * Bangun where Prisma dari filter export (dipakai count + export agar konsisten).
 * Memanfaatkan index: city, status, createdAt. Throw Error 400-friendly bila invalid.
 */
export function buildExportWhere(f: ExportFilters): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [];

  const search = f.search.trim();
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    });
  }

  const city = f.city.trim();
  if (city && city.toLowerCase() !== "semua") {
    and.push({ city });
  }

  const status = f.status.trim().toUpperCase();
  if (status && status !== "SEMUA") {
    if (!VALID_STATUS.includes(status as CustomerStatus)) {
      fail("Status tidak valid. Gunakan NEW, FOLLOW_UP, atau COMPLETED.");
    }
    and.push({ status: status as CustomerStatus });
  }

  if (f.startDate || f.endDate) {
    if (!f.startDate || !f.endDate) fail("Tanggal mulai dan tanggal akhir harus diisi bersamaan.");
    const start = parseDay(f.startDate, "Tanggal mulai");
    const endDay = parseDay(f.endDate, "Tanggal akhir");
    if (start.getTime() > endDay.getTime()) fail("Tanggal mulai tidak boleh setelah tanggal akhir.");
    // Inklusif penuh: [start 00:00, end+1 hari 00:00).
    const endExclusive = new Date(endDay.getTime() + 24 * 3600 * 1000);
    and.push({ createdAt: { gte: start, lt: endExclusive } });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** Batch size export: default 1000, clamp 100–5000. Bisa dioverride via env (untuk test). */
export function exportBatchSize(): number {
  const raw = Number.parseInt(process.env.EXPORT_BATCH_SIZE ?? "", 10);
  if (Number.isFinite(raw)) return Math.min(5000, Math.max(100, raw));
  return 1000;
}
