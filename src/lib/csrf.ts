import type { NextRequest } from "next/server";

/**
 * Proteksi CSRF sederhana untuk API mutasi berauth (POST/PATCH/DELETE):
 * tolak bila header Origin ada dan host-nya beda dari Host request.
 * Tanpa Origin (curl, server-to-server, webhook Meta) → lolos (bukan browser).
 * Bukan pengganti SameSite=Lax (sudah aktif di cookie), melainkan lapis tambahan.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
