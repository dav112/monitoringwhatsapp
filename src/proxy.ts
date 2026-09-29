import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken, type SessionUser } from "@/lib/session-crypto";

/**
 * Proteksi halaman (lapis pertama; API + layout memverifikasi ulang + cek ACTIVE).
 * - Belum login → /login
 * - Sudah login buka /login → /dashboard
 * - /users → ADMIN saja; /settings & /export → ADMIN & SUPERVISOR (CS tanpa export)
 * Webhook (/api/wa/webhook) TIDAK lewat sini (matcher mengecualikan /api).
 */
const ADMIN_ONLY = new Set(["/users"]);
const ADMIN_SUPERVISOR = new Set(["/settings", "/export"]);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    const session = await readSessionCookie(req);
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  const session = await readSessionCookie(req);
  if (!session) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  if (ADMIN_ONLY.has(pathname) && session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (ADMIN_SUPERVISOR.has(pathname) && session.role !== "ADMIN" && session.role !== "SUPERVISOR") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

async function readSessionCookie(req: NextRequest): Promise<SessionUser | null> {
  const sealed = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sealed) return null;
  try {
    return await readSessionToken(sealed);
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/dashboard", "/customers", "/whatsapp", "/tutorial", "/export", "/settings", "/users", "/login"],
};
