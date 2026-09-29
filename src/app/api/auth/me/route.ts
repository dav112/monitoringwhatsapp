import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  return NextResponse.json({
    data: { user: { id: auth.userId, name: auth.name, email: auth.email, role: auth.role } },
  });
}
