import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { buildExportWhere, filtersFromParams } from "@/lib/export/filter";

/**
 * GET /api/export/customers/count — jumlah rows sesuai filter (ADMIN, SUPERVISOR).
 * Dipakai UI untuk menampilkan "N customer ditemukan" sebelum export.
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
    return NextResponse.json({ data: { total } });
  } catch (e) {
    console.error("GET /api/export/customers/count error:", e);
    return apiError("Gagal menghitung data.", 500);
  }
}
