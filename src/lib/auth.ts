import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, getSessionFromCookies, type SessionUser } from "@/lib/session";

export type { SessionUser };
export type ActorRole = SessionUser["role"];

export interface AuthFail {
  status: 401 | 403;
  message: string;
}

/**
 * Ambil user terautentikasi + pastikan masih ACTIVE di database.
 * Dipakai semua API terproteksi (satu lookup PK yang murah).
 */
async function resolveUser(sealed: SessionUser | null): Promise<SessionUser | null> {
  if (!sealed) return null;
  const user = await prisma.user.findUnique({
    where: { id: sealed.userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { userId: user.id, role: user.role, name: user.name, email: user.email };
}

/** Untuk route handler: 401 bila tanpa/tak valid session atau user nonaktif. */
export async function requireAuth(req: NextRequest): Promise<SessionUser | AuthFail> {
  const user = await resolveUser(await getSessionFromRequest(req));
  if (!user) return { status: 401, message: "Unauthorized. Silakan login." };
  return user;
}

/** Untuk Server Component/layout: null bila tidak valid (caller redirect ke /login). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return resolveUser(await getSessionFromCookies());
}

/** Untuk route handler: 401 tanpa session, 403 bila role tidak cukup. */
export async function requireRole(
  req: NextRequest,
  ...roles: ActorRole[]
): Promise<SessionUser | AuthFail> {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  if (!roles.includes(auth.role)) {
    return { status: 403, message: "Akses ditolak. Role tidak mencukupi." };
  }
  return auth;
}

/** Untuk route handler: khusus ADMIN. */
export async function requireAdmin(req: NextRequest): Promise<SessionUser | AuthFail> {
  return requireRole(req, "ADMIN");
}

/** Role pembaca cepat (tanpa DB) — HANYA untuk redirect middleware, bukan otorisasi data. */
export async function getActorRole(req: NextRequest): Promise<ActorRole | null> {
  const s = await getSessionFromRequest(req);
  return s?.role ?? null;
}
