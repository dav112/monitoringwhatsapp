/**
 * Uji authentication & RBAC Step 4B (DB asli, session nyata).
 * USE: npm run test:auth
 */
import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { sealData } from "iron-session";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`, e);
    process.exitCode = 1;
  }
}

const ADMIN = { email: "admin@example.local", password: "password123" };
const SUPERVISOR = { email: "supervisor@example.local", password: "password123" };
const CS = { email: "cs@example.local", password: "password123" };

async function main() {
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { POST: logout } = await import("../src/app/api/auth/logout/route");
  const { GET: me } = await import("../src/app/api/auth/me/route");
  const { GET: getUsers } = await import("../src/app/api/users/route");
  const { PATCH: patchUser } = await import("../src/app/api/users/[id]/route");
  const { GET: getCustomers } = await import("../src/app/api/customers/route");
  const { GET: getDashboard } = await import("../src/app/api/dashboard/route");
  const { PATCH: patchWaConfig } = await import("../src/app/api/wa/config/route");
  const { GET: verifyWebhook, POST: inboundWebhook } = await import(
    "../src/app/api/wa/webhook/route"
  );
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  const loginReq = (email: string, password: string) =>
    new NextRequest("http://test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  const cookieOf = (res: Response): string => {
    const sc = res.headers.get("set-cookie") ?? "";
    const part = sc.split(";")[0];
    assert.ok(part.startsWith("wa_session="), "cookie session tidak ada");
    return part;
  };
  const authed = (url: string, cookie?: string, method = "GET", body?: unknown) =>
    new NextRequest(url, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // --- login ---
  let adminCookie = "";
  await check("login ADMIN valid → 200 + cookie HttpOnly", async () => {
    const res = await login(loginReq(ADMIN.email, ADMIN.password));
    assert.equal(res.status, 200);
    const sc = res.headers.get("set-cookie") ?? "";
    assert.ok(sc.includes("HttpOnly"), "cookie harus HttpOnly");
    assert.ok(!sc.toLowerCase().includes("password"), "password di cookie?");
    adminCookie = cookieOf(res);
    const json = await res.json();
    assert.equal(json.data.user.role, "ADMIN");
    assert.ok(!("passwordHash" in json.data.user));
  });
  await check("login password salah → 401 generik", async () => {
    const res = await login(loginReq(ADMIN.email, "salah total"));
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid email or password.");
  });
  await check("login email tak dikenal → 401 sama (anti enumeration)", async () => {
    const res = await login(loginReq("tidak@ada.local", "apapun123"));
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid email or password.");
  });

  // user INACTIVE sementara
  const tempEmail = "temp-inactive@example.local";
  const temp = await prisma.user.create({
    data: {
      name: "Temp Inactive",
      email: tempEmail,
      passwordHash: await bcrypt.hash("TempPass123!", 10),
      role: "CS",
      status: "INACTIVE",
    },
  });
  await check("user INACTIVE ditolak login → 403", async () => {
    const res = await login(loginReq(tempEmail, "TempPass123!"));
    assert.equal(res.status, 403);
  });

  const supervisorCookie = cookieOf(await login(loginReq(SUPERVISOR.email, SUPERVISOR.password)));
  const csCookie = cookieOf(await login(loginReq(CS.email, CS.password)));

  // --- session ---
  await check("me dengan session valid → user aman", async () => {
    const res = await me(authed("http://test/api/auth/me", adminCookie));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.user.email, ADMIN.email);
    assert.ok(!("passwordHash" in json.data.user));
  });
  await check("me tanpa session → 401", async () => {
    const res = await me(authed("http://test/api/auth/me"));
    assert.equal(res.status, 401);
  });
  await check("me cookie rusak → 401", async () => {
    const res = await me(authed("http://test/api/auth/me", "wa_session=rsk.x"));
    assert.equal(res.status, 401);
  });
  await check("session expired → 401", async () => {
    const short = await sealData(
      { userId: "x", role: "ADMIN", name: "x", email: "x" },
      { password: process.env.AUTH_SECRET!, ttl: 1 },
    );
    await new Promise((r) => setTimeout(r, 1200));
    const res = await me(authed("http://test/api/auth/me", `wa_session=${short}`));
    assert.equal(res.status, 401);
  });

  // --- roles: users API (ADMIN only) ---
  await check("ADMIN GET /api/users → 200 tanpa passwordHash", async () => {
    const res = await getUsers(authed("http://test/api/users", adminCookie));
    assert.equal(res.status, 200);
    assert.ok(!(await res.text()).includes("passwordHash"));
  });
  await check("SUPERVISOR GET /api/users → 403", async () => {
    const res = await getUsers(authed("http://test/api/users", supervisorCookie));
    assert.equal(res.status, 403);
  });
  await check("CS GET /api/users → 403", async () => {
    const res = await getUsers(authed("http://test/api/users", csCookie));
    assert.equal(res.status, 403);
  });
  await check("tanpa session GET /api/users → 401", async () => {
    const res = await getUsers(authed("http://test/api/users"));
    assert.equal(res.status, 401);
  });

  // --- activate/deactivate + proteksi diri sendiri ---
  await check("ADMIN nonaktifkan user → 200; user tsb tak bisa login", async () => {
    const active = await prisma.user.create({
      data: {
        name: "Temp Active",
        email: "temp-active@example.local",
        passwordHash: await bcrypt.hash("TempPass123!", 10),
        role: "CS",
        status: "ACTIVE",
      },
    });
    const res = await patchUser(
      authed("http://test/api/users/x", adminCookie, "PATCH", { status: "INACTIVE" }),
      { params: Promise.resolve({ id: active.id }) },
    );
    assert.equal(res.status, 200);
    const relogin = await login(loginReq("temp-active@example.local", "TempPass123!"));
    assert.equal(relogin.status, 403);
    await prisma.user.delete({ where: { id: active.id } });
  });
  await check("ADMIN tak bisa nonaktifkan diri sendiri → 400", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    const res = await patchUser(
      authed("http://test/api/users/x", adminCookie, "PATCH", { status: "INACTIVE" }),
      { params: Promise.resolve({ id: admin.id }) },
    );
    assert.equal(res.status, 400);
  });
  await check("CS tak bisa ubah status user → 403", async () => {
    const res = await patchUser(
      authed("http://test/api/users/x", csCookie, "PATCH", { status: "ACTIVE" }),
      { params: Promise.resolve({ id: temp.id }) },
    );
    assert.equal(res.status, 403);
  });

  // --- API matrix umum ---
  await check("CS GET /api/customers → 200; tanpa session → 401", async () => {
    const okRes = await getCustomers(authed("http://test/api/customers?page=1&limit=2", csCookie));
    assert.equal(okRes.status, 200);
    const noRes = await getCustomers(authed("http://test/api/customers"));
    assert.equal(noRes.status, 401);
  });
  await check("SUPERVISOR GET /api/dashboard → 200", async () => {
    const res = await getDashboard(authed("http://test/api/dashboard", supervisorCookie));
    assert.equal(res.status, 200);
  });
  await check("CS PATCH /api/wa/config → 403; SUPERVISOR → 403", async () => {
    const a = await patchWaConfig(authed("http://test/x", csCookie, "PATCH", {}));
    const b = await patchWaConfig(authed("http://test/x", supervisorCookie, "PATCH", {}));
    assert.equal(a.status, 403);
    assert.equal(b.status, 403);
  });

  // --- rate limit ---
  await check("brute force dibatasi → 429", async () => {
    const email = "ratelimit-probe@example.local";
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await login(loginReq(email, "salah"));
      last = r.status;
    }
    assert.equal(last, 429);
  });

  // --- logout: cookie dibersihkan ---
  await check("logout membersihkan cookie", async () => {
    const res = await logout();
    assert.equal(res.status, 200);
    const sc = (res.headers.get("set-cookie") ?? "").toLowerCase();
    assert.ok(sc.includes("max-age=0") || sc.includes("expires="), "cookie harus dihapus");
  });

  // --- webhook tetap publik ---
  await check("webhook verify tanpa session → 200/403 sesuai token", async () => {
    const token = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
    const okUrl = `http://test/api/wa/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=C`;
    const okRes = await verifyWebhook(new NextRequest(okUrl));
    assert.equal(okRes.status, 200);
    const badRes = await verifyWebhook(
      new NextRequest("http://test/api/wa/webhook?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=C"),
    );
    assert.equal(badRes.status, 403);
  });
  await check("webhook POST mock tanpa session → 200 + tersimpan", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Auth Probe" }, wa_id: "6281990003333" }],
                messages: [
                  {
                    from: "6281990003333",
                    id: "wamid.AUTHPROBE1",
                    timestamp: "1727000000",
                    type: "text",
                    text: { body: "halo kak" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const res = await inboundWebhook(
      new NextRequest("http://test/api/wa/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    assert.equal(res.status, 200);
    const saved = await prisma.whatsAppMessage.findUnique({
      where: { messageId: "wamid.AUTHPROBE1" },
    });
    assert.ok(saved, "pesan harus tersimpan");
    await prisma.customer.deleteMany({ where: { phone: "6281990003333" } });
    await prisma.whatsAppMessage.deleteMany({ where: { messageId: "wamid.AUTHPROBE1" } });
  });

  // --- cleanup ---
  await prisma.user.delete({ where: { id: temp.id } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
