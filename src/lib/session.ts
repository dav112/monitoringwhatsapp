import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
  type SessionUser,
} from "./session-crypto";

export { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, readSessionToken };
export type { SessionUser };

/** Baca session dari request (route handler). Tanpa DB check. */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const sealed = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sealed) return null;
  return readSessionToken(sealed);
}

/** Baca session di Server Component / layout (tanpa DB check). */
export async function getSessionFromCookies(): Promise<SessionUser | null> {
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sealed) return null;
  return readSessionToken(sealed);
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
