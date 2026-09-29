import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { getEffectiveConfig } from "@/lib/whatsapp/config";
import { checkApiHealth } from "@/lib/whatsapp/client";
import { apiError } from "@/lib/api-response";

/**
 * POST /api/wa/test-connection — Test Connection (ADMIN saja).
 * Backend mendekripsi credential server-side, memanggil Graph API,
 * dan hanya mengembalikan hasil aman. Token tidak pernah ke frontend.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }

  try {
    const creds = await getEffectiveConfig();
    if (!creds.accessToken || !creds.phoneNumberId) {
      return NextResponse.json({
        data: { reachable: false, message: "Credential belum lengkap (butuh Access Token + Phone Number ID)." },
      });
    }
    const health = await checkApiHealth(true, {
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
    });
    return NextResponse.json({
      data: {
        reachable: health.reachable,
        displayPhoneNumber: health.displayPhoneNumber,
        verifiedName: health.verifiedName,
        message: health.reachable
          ? "WhatsApp API reachable."
          : "WhatsApp API could not be reached. Periksa token dan Phone Number ID.",
      },
    });
  } catch (e) {
    console.error("POST /api/wa/test-connection error:", e);
    return apiError("Gagal menguji koneksi.", 500);
  }
}
