import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnvReport } from "@/lib/env";
import { getConfigStatus } from "@/lib/whatsapp/config";

/**
 * GET /api/health — health check publik yang aman (untuk monitoring/load balancer).
 * Murah: SELECT 1 + baca satu baris config. TANPA secret, TANPA Graph API call.
 */
export async function GET() {
  let database: "ok" | "error" = "error";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    console.error("Health check database gagal.");
  }

  const env = getEnvReport();
  let whatsapp: "configured" | "partial" | "missing" = "missing";
  try {
    const s = await getConfigStatus();
    whatsapp = s.configured ? "configured" : s.source !== "none" ? "partial" : "missing";
  } catch {
    whatsapp = "missing";
  }

  const ok = database === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      whatsapp,
      env: {
        DATABASE_URL: env.DATABASE_URL,
        AUTH_SECRET: env.AUTH_SECRET,
        WHATSAPP_CONFIG_ENCRYPTION_KEY: env.WHATSAPP_CONFIG_ENCRYPTION_KEY,
      },
    },
    { status: ok ? 200 : 503 },
  );
}
