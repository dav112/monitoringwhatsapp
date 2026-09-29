import { sealData, unsealData } from "iron-session";

/**
 * Inti session sealed-cookie TANPA dependensi next/headers,
 * sehingga aman diimpor middleware (Edge) maupun Node.
 */

export const SESSION_COOKIE = "wa_session";
export const SESSION_TTL_SECONDS = 8 * 3600;

export interface SessionUser {
  userId: string;
  role: "ADMIN" | "SUPERVISOR" | "CS";
  name: string;
  email: string;
}

function getPassword(): string {
  const s = (process.env.AUTH_SECRET || "").trim();
  if (s.length < 32) {
    throw new Error("AUTH_SECRET belum dikonfigurasi (minimal 32 karakter acak).");
  }
  return s;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function isSessionUser(v: unknown): v is SessionUser {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.userId === "string" &&
    (o.role === "ADMIN" || o.role === "SUPERVISOR" || o.role === "CS") &&
    typeof o.name === "string" &&
    typeof o.email === "string"
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return sealData(user, { password: getPassword(), ttl: SESSION_TTL_SECONDS });
}

export async function readSessionToken(sealed: string): Promise<SessionUser | null> {
  try {
    const data = await unsealData(sealed, {
      password: getPassword(),
      ttl: SESSION_TTL_SECONDS,
    });
    return isSessionUser(data) ? data : null;
  } catch {
    return null; // expired / rusak / password beda
  }
}
