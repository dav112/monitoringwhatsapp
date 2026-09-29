/**
 * Smoke test non-destruktif terhadap server yang sedang jalan.
 * USE: BASE_URL=http://localhost:3100 npm run smoke:prod
 * Hanya read + login/logout (login mengupdate lastActiveAt — behavior normal).
 */
import "dotenv/config";
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL - ${name}`, e instanceof Error ? e.message : e);
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
  const sc = res.headers.get("set-cookie") ?? "";
  const part = sc.split(";")[0];
  if (!part.startsWith("wa_session=")) throw new Error("tanpa cookie session");
  return part;
}

async function main() {
  // --- anonim ---
  await check("anon /dashboard → redirect /login", async () => {
    const r = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    assert(r.status === 307 || r.status === 308, `status ${r.status}`);
    assert((r.headers.get("location") ?? "").includes("/login"), "harus ke /login");
  });
  for (const p of ["/api/customers", "/api/wa/messages", "/api/users", "/api/export/customers/count"]) {
    await check(`anon ${p} → 401`, async () => {
      const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
      assert(r.status === 401, `status ${r.status}`);
    });
  }
  await check("webhook verify publik (token salah → 403, bukan 401)", async () => {
    const r = await fetch(
      `${BASE}/api/wa/webhook?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=x`,
      { redirect: "manual" },
    );
    assert(r.status === 403, `status ${r.status}`);
  });
  await check("/api/health → 200 tanpa nilai secret", async () => {
    const r = await fetch(`${BASE}/api/health`, { redirect: "manual" });
    assert(r.status === 200 || r.status === 503, `status ${r.status}`);
    const body = await r.text();
    // Guard: NILAI secret (env) tidak boleh muncul; nama key seperti
    // "AUTH_SECRET" memang bagian dari status report.
    const values = ["DATABASE_URL", "AUTH_SECRET", "WHATSAPP_CONFIG_ENCRYPTION_KEY"]
      .map((k) => process.env[k]?.trim())
      .filter((v): v is string => Boolean(v && v.length >= 8));
    assert(!values.some((v) => body.includes(v)), "nilai secret bocor?");
  });

  // --- CS ---
  const cs = await loginAs("cs@example.local", "password123");
  const H = { cookie: cs };
  await check("CS /dashboard → 200", async () => {
    assert((await fetch(`${BASE}/dashboard`, { headers: H })).status === 200, "bukan 200");
  });
  await check("CS /customers → 200, /whatsapp → 200", async () => {
    assert((await fetch(`${BASE}/customers`, { headers: H })).status === 200, "customers");
    assert((await fetch(`${BASE}/whatsapp`, { headers: H })).status === 200, "whatsapp");
  });
  await check("CS /users → redirect, /settings → redirect", async () => {
    const u = await fetch(`${BASE}/users`, { headers: H, redirect: "manual" });
    assert([307, 308].includes(u.status), `users: ${u.status}`);
    const s = await fetch(`${BASE}/settings`, { headers: H, redirect: "manual" });
    assert([307, 308].includes(s.status), `settings: ${s.status}`);
  });
  await check("CS /api/users → 403", async () => {
    assert((await fetch(`${BASE}/api/users`, { headers: H })).status === 403, "bukan 403");
  });

  // --- ADMIN ---
  const admin = await loginAs("admin@example.local", "password123");
  const AH = { cookie: admin };
  await check("ADMIN /settings → 200, /users → 200", async () => {
    assert((await fetch(`${BASE}/settings`, { headers: AH })).status === 200, "settings");
    assert((await fetch(`${BASE}/users`, { headers: AH })).status === 200, "users");
  });
  await check("ADMIN /api/wa/status → 200", async () => {
    assert((await fetch(`${BASE}/api/wa/status`, { headers: AH })).status === 200, "bukan 200");
  });
  await check("security headers ada", async () => {
    const r = await fetch(`${BASE}/dashboard`, { headers: AH });
    assert(r.headers.get("x-content-type-options") === "nosniff", "tanpa nosniff");
    assert(r.headers.get("x-frame-options") === "DENY", "tanpa DENY");
  });

  console.log(`\n${passed} lolos, ${failed} gagal.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
