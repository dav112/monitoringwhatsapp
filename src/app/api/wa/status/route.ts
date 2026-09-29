import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkApiHealth } from "@/lib/whatsapp/client";
import { getConfigStatus, getEffectiveConfig } from "@/lib/whatsapp/config";
import { apiError } from "@/lib/api-response";

/**
 * GET /api/wa/status — status AMAN untuk frontend terautentikasi (semua role).
 * Diproteksi session karena memuat pesan terakhir (PII customer).
 * Sumber credential: database diprioritaskan, env sebagai fallback.
 * TIDAK PERNAH mengembalikan access token, app secret, verify token, atau encryption key.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const status = await getConfigStatus();
    const creds = await getEffectiveConfig();

    const health = status.configured
      ? await checkApiHealth(false, {
          accessToken: creds.accessToken,
          phoneNumberId: creds.phoneNumberId,
        })
      : { reachable: false, displayPhoneNumber: null, verifiedName: null };

    const lastMessage = await prisma.whatsAppMessage.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        phone: true,
        messageType: true,
        content: true,
        direction: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });

    const totalInbound = await prisma.whatsAppMessage.count({ where: { direction: "INBOUND" } });

    return NextResponse.json({
      data: {
        configured: status.configured,
        phoneNumberConfigured: status.phoneNumberIdConfigured,
        webhookConfigured: status.verifyTokenConfigured,
        appSecretConfigured: status.appSecretConfigured,
        apiReachable: status.configured ? health.reachable : null,
        displayPhoneNumber: health.displayPhoneNumber,
        verifiedName: health.verifiedName,
        totalInbound,
        lastMessage,
      },
    });
  } catch (e) {
    console.error("GET /api/wa/status error:", e);
    return apiError("Gagal mengambil status WhatsApp.", 500);
  }
}
