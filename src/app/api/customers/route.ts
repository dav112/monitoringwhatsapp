import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { CustomerStatus } from "@prisma/client";

const VALID_STATUS: CustomerStatus[] = ["NEW", "FOLLOW_UP", "COMPLETED"];
const VALID_SORT: Record<string, "name" | "phone" | "city" | "status" | "createdAt" | "updatedAt"> = {
  name: "name",
  phone: "phone",
  city: "city",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const params = req.nextUrl.searchParams;
    const search = (params.get("search") ?? "").trim();
    const city = (params.get("city") ?? "").trim();
    const statusRaw = (params.get("status") ?? "").trim().toUpperCase();
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "10", 10) || 10));

    const [sortFieldRaw, sortDirRaw] = (params.get("sort") ?? "createdAt:desc").split(":");
    const sortField = VALID_SORT[sortFieldRaw] ?? "createdAt";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    if (statusRaw && statusRaw !== "SEMUA" && !VALID_STATUS.includes(statusRaw as CustomerStatus)) {
      return apiError("Status tidak valid. Gunakan NEW, FOLLOW_UP, atau COMPLETED.", 400);
    }

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
      ...(city && city.toLowerCase() !== "semua" ? { city } : {}),
      ...(statusRaw && statusRaw !== "SEMUA" ? { status: statusRaw as CustomerStatus } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, totalPages },
    });
  } catch (e) {
    console.error("GET /api/customers error:", e);
    return apiError("Gagal mengambil data customer.", 500);
  }
}
