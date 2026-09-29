import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

/** GET /api/users — khusus ADMIN. JANGAN pernah return passwordHash. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: users });
  } catch (e) {
    console.error("GET /api/users error:", e);
    return apiError("Gagal mengambil data users.", 500);
  }
}
