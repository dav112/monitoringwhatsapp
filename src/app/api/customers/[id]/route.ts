import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-response";
import { CustomerStatus } from "@prisma/client";

const VALID_STATUS: CustomerStatus[] = ["NEW", "FOLLOW_UP", "COMPLETED"];

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const { id } = await ctx.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!customer) return apiError("Customer tidak ditemukan.", 404);

    const interactions = await prisma.customerInteraction.findMany({
      where: { customerId: id },
      select: { id: true, type: true, content: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: { customer, interactions } });
  } catch (e) {
    console.error("GET /api/customers/[id] error:", e);
    return apiError("Gagal mengambil detail customer.", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return apiError("Body request tidak valid.", 400);

    // Whitelist field — jangan terima field database bebas.
    const update: { name?: string; phone?: string; city?: string; status?: CustomerStatus } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length < 2) {
        return apiError("Nama minimal 2 karakter.", 400);
      }
      update.name = body.name.trim();
    }
    if (body.phone !== undefined) {
      if (typeof body.phone !== "string" || !/^[0-9+]{8,18}$/.test(body.phone.trim())) {
        return apiError("Nomor WhatsApp tidak valid (8–18 digit).", 400);
      }
      update.phone = body.phone.trim();
    }
    if (body.city !== undefined) {
      if (typeof body.city !== "string" || body.city.trim().length < 2) {
        return apiError("Kota minimal 2 karakter.", 400);
      }
      update.city = body.city.trim();
    }
    if (body.status !== undefined) {
      const s = String(body.status).toUpperCase();
      if (!VALID_STATUS.includes(s as CustomerStatus)) {
        return apiError("Status tidak valid. Gunakan NEW, FOLLOW_UP, atau COMPLETED.", 400);
      }
      update.status = s as CustomerStatus;
    }

    if (Object.keys(update).length === 0) {
      return apiError("Tidak ada field yang bisa diupdate.", 400);
    }

    const existing = await prisma.customer.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return apiError("Customer tidak ditemukan.", 404);

    const updated = await prisma.customer.update({
      where: { id },
      data: update,
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (update.status && update.status !== existing.status) {
      await prisma.customerInteraction.create({
        data: {
          customerId: id,
          type: "STATUS_CHANGED",
          content: `Status berubah: ${existing.status} → ${update.status}`,
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (e) {
    console.error("PATCH /api/customers/[id] error:", e);
    return apiError("Gagal mengupdate customer.", 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return apiError("Customer tidak ditemukan.", 404);

    // Interactions ikut terhapus (Cascade), messages jadi null (SetNull).
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    console.error("DELETE /api/customers/[id] error:", e);
    return apiError("Gagal menghapus customer.", 500);
  }
}
