import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-response";

const ALLOWED_KEYS = new Set([
  "city_question",
  "save_name",
  "save_phone",
  "save_city",
  "save_timestamp",
  "auto_city_detection",
]);

const BOOLEAN_KEYS = new Set([
  "save_name",
  "save_phone",
  "save_city",
  "save_timestamp",
  "auto_city_detection",
]);

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const rows = await prisma.setting.findMany({
      select: { key: true, value: true },
    });
    const data: Record<string, string> = {};
    for (const r of rows) data[r.key] = r.value;
    return NextResponse.json({ data });
  } catch (e) {
    console.error("GET /api/settings error:", e);
    return apiError("Gagal mengambil pengaturan.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  // Pengaturan operasional (pertanyaan kota, field simpanan): ADMIN + SUPERVISOR.
  // Kredensial WhatsApp tetap ADMIN-only via /api/wa/* .
  const auth = await requireRole(req, "ADMIN", "SUPERVISOR");
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origin tidak valid." }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return apiError("Body request tidak valid.", 400);

    // Dukung { key, value } atau { values: { key: value } }
    let entries: [string, unknown][] = [];
    if (typeof body.key === "string") {
      entries = [[body.key, body.value]];
    } else if (body.values && typeof body.values === "object") {
      entries = Object.entries(body.values as Record<string, unknown>);
    } else {
      return apiError("Format body tidak valid. Gunakan { key, value } atau { values }. ", 400);
    }

    const updated: Record<string, string> = {};
    for (const [key, raw] of entries) {
      if (!ALLOWED_KEYS.has(key)) {
        return apiError(`Key pengaturan tidak dikenal: ${key}.`, 400);
      }
      if (typeof raw !== "string") {
        return apiError(`Value untuk ${key} harus string.`, 400);
      }
      const value = raw.trim();
      if (key === "city_question" && value.length < 5) {
        return apiError("Pertanyaan kota minimal 5 karakter.", 400);
      }
      if (BOOLEAN_KEYS.has(key) && value !== "true" && value !== "false") {
        return apiError(`Value untuk ${key} harus "true" atau "false".`, 400);
      }
      const row = await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
        select: { key: true, value: true },
      });
      updated[row.key] = row.value;
    }

    return NextResponse.json({ data: updated });
  } catch (e) {
    console.error("PATCH /api/settings error:", e);
    return apiError("Gagal menyimpan pengaturan.", 500);
  }
}
