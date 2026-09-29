import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/users/[id] — activate/deactivate user (ADMIN saja).
 * Hanya field `status` yang bisa diubah (tidak ada ubah role via API,
 * sehingga user tidak bisa mengubah role dirinya sendiri).
 * Admin tidak bisa menonaktifkan akunnya sendiri.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, "ADMIN");
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return apiError("Body bukan JSON valid.", 400);
    }
    const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    if (status !== "ACTIVE" && status !== "INACTIVE") {
      return apiError("Status harus ACTIVE atau INACTIVE.", 400);
    }
    if (id === auth.userId && status === "INACTIVE") {
      return apiError("Tidak bisa menonaktifkan akun sendiri.", 400);
    }
    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return apiError("User tidak ditemukan.", 404);

    const updated = await prisma.user.update({
      where: { id },
      data: { status: status as "ACTIVE" | "INACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    console.error("PATCH /api/users/[id] error:", e);
    return apiError("Gagal mengupdate user.", 500);
  }
}
