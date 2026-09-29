import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { getConfigStatus, saveConfig, type ClearableId } from "@/lib/whatsapp/config";
import type { ClearableSecret } from "@/lib/whatsapp/config";
import { apiError } from "@/lib/api-response";

/**
 * GET /api/wa/config — status konfigurasi AMAN (flags saja, semua role terautentikasi).
 * TIDAK PERNAH mengembalikan secret, token, atau encryption key.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const status = await getConfigStatus();
    return NextResponse.json({ data: status });
  } catch (e) {
    console.error("GET /api/wa/config error:", e);
    return apiError("Gagal mengambil status konfigurasi.", 500);
  }
}

const SECRET_FIELDS = ["accessToken", "verifyToken", "appSecret"] as const;
const ID_FIELDS = ["phoneNumberId", "businessAccountId"] as const;
const CLEARABLE = new Set<string>([...SECRET_FIELDS, ...ID_FIELDS]);

/**
 * PATCH /api/wa/config — simpan/update credential (ADMIN saja).
 * Secret kosong/undefined = pertahankan lama; hapus hanya via `clear: [...]`.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body bukan JSON valid.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Body request tidak valid.", 400);
  }

  // Whitelist field — tolak key tak dikenal.
  const allowed = new Set<string>([...SECRET_FIELDS, ...ID_FIELDS, "clear"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return apiError(`Field tidak dikenal: ${key}.`, 400);
  }

  const str = (v: unknown): string | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return undefined;
    return v;
  };

  let clear: (ClearableSecret | ClearableId)[] = [];
  if (body.clear !== undefined) {
    if (!Array.isArray(body.clear) || !body.clear.every((k) => typeof k === "string" && CLEARABLE.has(k))) {
      return apiError("Field clear harus array dari nama field yang valid.", 400);
    }
    clear = body.clear as (ClearableSecret | ClearableId)[];
  }

  for (const f of [...SECRET_FIELDS, ...ID_FIELDS]) {
    if (body[f] !== undefined && str(body[f]) === undefined) {
      return apiError(`Field ${f} harus string.`, 400);
    }
  }

  try {
    const status = await saveConfig({
      accessToken: str(body.accessToken),
      phoneNumberId: str(body.phoneNumberId),
      businessAccountId: str(body.businessAccountId),
      verifyToken: str(body.verifyToken),
      appSecret: str(body.appSecret),
      clear,
    });
    return NextResponse.json({ data: status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan konfigurasi.";
    console.error("[WhatsApp] Gagal menyimpan konfigurasi.");
    const clientError =
      msg.includes("minimal") ||
      msg.includes("harus berupa angka") ||
      msg.includes("ENCRYPTION_KEY");
    return apiError(clientError ? msg : "Gagal menyimpan konfigurasi.", clientError ? 400 : 500);
  }
}
