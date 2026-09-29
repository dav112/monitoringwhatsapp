import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { clearLoginAttempts, loginAllowed, registerFailedLogin } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";

// Hash dummy agar waktu respons user-ada vs tidak-ada tidak mudah dibedakan.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.5f6p9Q0x1y2z3a4b5c6d7e8f9g0h1";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body bukan JSON valid.", 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 256) {
    return apiError("Invalid email or password.", 401);
  }

  const key = `${clientIp(req)}:${email}`;
  if (!loginAllowed(key)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi beberapa menit." },
      { status: 429 },
    );
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
      registerFailedLogin(key);
      return apiError("Invalid email or password.", 401);
    }
    if (user.status !== "ACTIVE") {
      registerFailedLogin(key);
      return NextResponse.json(
        { error: "Account is inactive. Please contact an administrator." },
        { status: 403 },
      );
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      registerFailedLogin(key);
      return apiError("Invalid email or password.", 401);
    }

    clearLoginAttempts(key);
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: now },
    });

    const token = await createSessionToken({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });
    const res = NextResponse.json({
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error("POST /api/auth/login error:", e);
    return apiError("Login gagal. Coba lagi.", 500);
  }
}
