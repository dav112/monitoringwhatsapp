import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { buildExportWhere, filtersFromParams } from "@/lib/export/filter";
import {
  createXlsxPassthrough,
  exportFilename,
  iterateCustomerBatches,
  nodeToWeb,
  writeCustomersXlsx,
} from "@/lib/export/excel";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/export/customers — export SELURUH hasil filter ke .xlsx (ADMIN, SUPERVISOR).
 * Streaming: DB dibaca per batch (keyset) → WorkbookWriter → response stream.
 * Hanya satu batch di memory; tanpa file temp; tanpa state global (aman konkurensi).
 * GET tanpa CSRF-token check (navigasi download tak kirim Origin); cookie SameSite=Lax aktif.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN", "SUPERVISOR");
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let where;
  try {
    where = buildExportWhere(filtersFromParams(req.nextUrl.searchParams));
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Filter tidak valid.", 400);
  }

  try {
    const total = await prisma.customer.count({ where });
    if (total === 0) {
      return NextResponse.json(
        { error: "Tidak ada data customer yang sesuai dengan filter." },
        { status: 404 },
      );
    }

    const passthrough = createXlsxPassthrough();
    // Jalan async; error mid-stream dicatat server-side (status tak bisa diubah lagi).
    writeCustomersXlsx(iterateCustomerBatches(where), passthrough).catch((e: unknown) => {
      console.error("Export xlsx stream error:", e);
      passthrough.destroy(e as Error);
    });

    return new NextResponse(nodeToWeb(passthrough), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${exportFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /api/export/customers error:", e);
    return apiError("Gagal membuat file Excel.", 500);
  }
}
