import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const now = new Date();
    const today = startOfDay(now);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [totalCustomers, customersToday, customersThisWeek, customersThisMonth, byCityRaw, recentCustomers] =
      await Promise.all([
        prisma.customer.count(),
        prisma.customer.count({ where: { createdAt: { gte: today } } }),
        prisma.customer.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.customer.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.customer.groupBy({ by: ["city"], _count: { city: true }, orderBy: { _count: { city: "desc" } } }),
        prisma.customer.findMany({
          select: { id: true, name: true, phone: true, city: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);

    // 14 hari terakhir untuk grafik (label + jumlah per hari)
    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const count = await prisma.customer.count({
        where: { createdAt: { gte: d, lt: next } },
      });
      days.push({
        label: d.toLocaleDateString("id-ID", { day: "numeric", month: "numeric" }),
        value: count,
      });
    }

    return NextResponse.json({
      data: {
        totalCustomers,
        customersToday,
        customersThisWeek,
        customersThisMonth,
        customersByCity: byCityRaw.map((r) => ({ city: r.city, count: r._count.city })),
        recentCustomers,
        growth14d: days,
      },
    });
  } catch (e) {
    console.error("GET /api/dashboard error:", e);
    return apiError("Gagal mengambil statistik dashboard.", 500);
  }
}
