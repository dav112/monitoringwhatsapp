import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { exportBatchSize } from "./filter";

export const EXPORT_COLUMNS = [
  "Nama",
  "Nomor WhatsApp",
  "Kota",
  "Status",
  "Tanggal Dibuat",
  "Tanggal Diperbarui",
] as const;

export const STATUS_LABEL_ID: Record<string, string> = {
  NEW: "Baru",
  FOLLOW_UP: "Follow Up",
  COMPLETED: "Selesai",
};

export type ExportRow = {
  name: string;
  phone: string;
  city: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const SELECT = {
  name: true,
  phone: true,
  city: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ORDER_BY: Prisma.CustomerOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/**
 * Iterasi customer per batch memakai keyset (createdAt, id) — ordering deterministik,
 * stabil untuk dataset besar (tanpa OFFSET yang makin mahal), dan hanya SATU batch
 * di memory dalam satu waktu. Memanfaatkan index createdAt.
 */
export async function* iterateCustomerBatches(
  where: Prisma.CustomerWhereInput,
  batchSize = exportBatchSize(),
): AsyncGenerator<ExportRow[], void, void> {
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const keyset: Prisma.CustomerWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const rows = await prisma.customer.findMany({
      where: { AND: [where, keyset] },
      select: { ...SELECT, id: true },
      orderBy: ORDER_BY,
      take: batchSize,
    });
    if (rows.length === 0) break;
    yield rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      city: r.city,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    if (rows.length < batchSize) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}

/**
 * Konversi tanggal UTC ke wall-time Asia/Jakarta sebagai objek Date,
 * agar Excel menampilkan & mengurutkan waktu lokal dengan benar (numFmt tanggal).
 */
export function toJakartaWallTime(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

/** Nama file aman: customers-YYYYMMDD-HHmmss.xlsx (WIB). */
export function exportFilename(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `customers-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}.xlsx`;
}

/**
 * Tulis workbook ke Node stream secara streaming (WorkbookWriter):
 * baris di-commit per batch, memory tidak tumbuh mengikuti total rows.
 * Aman untuk konkurensi: semua state lokal per panggilan, tanpa file temp.
 */
export async function writeCustomersXlsx(
  batches: AsyncIterable<ExportRow[]>,
  stream: PassThrough,
): Promise<void> {
  // Partial: runtime hanya butuh stream (+flag); filename/zip opsional.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: true,
    useStyles: true,
  });
  // autoFilter didukung runtime streaming writer walau belum ada di tipenya.
  const wsOptions: Partial<ExcelJS.AddWorksheetOptions> & {
    autoFilter?: { from: string; to: string };
  } = {
    views: [{ state: "frozen", ySplit: 1 }],
    autoFilter: { from: "A1", to: "F1" },
  };
  const ws = workbook.addWorksheet("Customers", wsOptions);

  const widths = [28, 20, 16, 14, 20, 20];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const headerRow = ws.addRow([...EXPORT_COLUMNS]);
  headerRow.font = { bold: true, color: { argb: "FF0F3D23" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBBF7D0" },
  };
  headerRow.commit();

  for await (const batch of batches) {
    for (const r of batch) {
      const row = ws.addRow([
        r.name,
        r.phone, // string → tidak jadi scientific notation
        r.city ?? "-",
        STATUS_LABEL_ID[r.status] ?? r.status,
        toJakartaWallTime(r.createdAt),
        toJakartaWallTime(r.updatedAt),
      ]);
      row.getCell(2).numFmt = "@";
      row.getCell(5).numFmt = "DD/MM/YYYY HH:mm";
      row.getCell(6).numFmt = "DD/MM/YYYY HH:mm";
      row.commit();
    }
  }

  ws.commit();
  await workbook.commit();
}

/** Jembatani Node Readable → Web ReadableStream untuk NextResponse. */
export function nodeToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export function createXlsxPassthrough(): PassThrough {
  return new PassThrough();
}
