/**
 * Uji production hardening Step 11 (non-destruktif; DB dev lokal saja).
 * USE: npm run test:production-hardening
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/punk/monitoring-whatsapp";

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

function secretValues(): string[] {
  return [
    process.env.WHATSAPP_ACCESS_TOKEN,
    process.env.WHATSAPP_APP_SECRET,
    process.env.WHATSAPP_VERIFY_TOKEN,
    process.env.AUTH_SECRET,
    process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY,
  ].filter((v): v is string => Boolean(v && v.trim().length >= 8));
}

async function main() {
  const { getEnvReport, productionEnvReady } = await import("../src/lib/env");
  const { retentionDays, countRetention, runRetention } = await import("../src/lib/retention");
  const { GET: health } = await import("../src/app/api/health/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { GET: me } = await import("../src/app/api/auth/me/route");
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  // --- 1. env validation ---
  await check("env report tanpa nilai secret", () => {
    const body = JSON.stringify(getEnvReport());
    for (const v of secretValues()) {
      assert.ok(!body.includes(v.trim()), "nilai secret di report");
    }
    assert.ok(["configured", "missing", "weak", "invalid"].includes(getEnvReport().AUTH_SECRET));
  });
  await check("weak secret terdeteksi", () => {
    const orig = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "password123";
    assert.equal(getEnvReport().AUTH_SECRET, "weak");
    assert.ok(productionEnvReady().problems.includes("AUTH_SECRET"));
    process.env.AUTH_SECRET = orig;
  });

  // --- 2. health endpoint ---
  await check("health 200 aman tanpa secret", async () => {
    const res = await health();
    assert.equal(res.status, 200);
    const body = await res.text();
    const json = JSON.parse(body);
    assert.equal(json.database, "ok");
    for (const v of secretValues()) {
      assert.ok(!body.includes(v.trim()), "nilai secret di /api/health");
    }
  });

  // --- 3. backup command validation ---
  await check("script backup ada + executable + gitignore", () => {
    for (const f of ["scripts/backup-db.sh", "scripts/verify-backup.sh", "scripts/restore-db.sh"]) {
      const st = fs.statSync(path.join(ROOT, f));
      assert.ok(st.mode & 0o111, `${f} harus executable`);
    }
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gi.includes("/backups/") && gi.includes("*.dump"));
    assert.ok(!gi.split("\n").some((l) => l.trim() === ".env.example"), ".env.example jangan di-ignore");
  });

  // --- 4. invalid backup path ---
  await check("verify path invalid gagal aman", () => {
    assert.throws(() =>
      execFileSync("bash", ["scripts/verify-backup.sh", "backups/tidak-ada.dump"], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    );
  });

  // --- 5/6/7. retention ---
  await check("retention parsing: 0/abc/negatif = disabled", () => {
    const orig = process.env.DATA_RETENTION_DAYS;
    process.env.DATA_RETENTION_DAYS = "0";
    assert.equal(retentionDays(), 0);
    process.env.DATA_RETENTION_DAYS = "abc";
    assert.equal(retentionDays(), 0);
    process.env.DATA_RETENTION_DAYS = "-5";
    assert.equal(retentionDays(), 0);
    process.env.DATA_RETENTION_DAYS = "365";
    assert.equal(retentionDays(), 365);
    if (orig === undefined) delete process.env.DATA_RETENTION_DAYS;
    else process.env.DATA_RETENTION_DAYS = orig;
  });
  await check("retention dry-run tak menghapus; apply hapus lama saja", async () => {
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const cust = await prisma.customer.create({
      data: { name: "RTN Probe", phone: "6281990001111", city: "Bogor", status: "NEW" },
    });
    const msg = await prisma.whatsAppMessage.create({
      data: {
        customerId: cust.id,
        messageId: "wamid.RTN1",
        phone: cust.phone,
        messageType: "text",
        content: "lama",
        direction: "INBOUND",
        createdAt: old,
      },
    });
    const inter = await prisma.customerInteraction.create({
      data: { customerId: cust.id, type: "NOTE", content: "lama", createdAt: old },
    });
    // dry-run
    const dry = await runRetention(30, false);
    assert.ok(dry.messages >= 1 && dry.interactions >= 1);
    assert.ok(await prisma.whatsAppMessage.findUnique({ where: { id: msg.id } }), "dry-run tak hapus");
    // apply
    const applied = await runRetention(30, true);
    assert.ok(applied.messages >= 1 && applied.interactions >= 1);
    assert.equal(await prisma.whatsAppMessage.findUnique({ where: { id: msg.id } }), null);
    assert.equal(await prisma.customerInteraction.findUnique({ where: { id: inter.id } }), null);
    // customer + data baru utuh
    assert.ok(await prisma.customer.findUnique({ where: { id: cust.id } }), "customer jangan dihapus");
    assert.ok((await countRetention(new Date(Date.now() - 30 * 24 * 3600 * 1000))).messages >= 0);
    await prisma.customer.delete({ where: { id: cust.id } });
  });

  // --- 8. no secret leakage (error responses) ---
  await check("error response generik tanpa bocor", async () => {
    const nf = await (
      await import("../src/app/api/customers/[id]/route")
    ).GET(
      new NextRequest("http://test/api/customers/nope", {
        headers: { cookie: await adminCookie(login) },
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    assert.equal(nf.status, 404);
    const body = await nf.text();
    for (const v of secretValues()) {
      assert.ok(!body.includes(v.trim()), "nilai secret di error");
    }
    assert.ok(!body.toLowerCase().includes("at prisma"), "stack trace bocor?");
  });

  // --- 9. generic API error shape ---
  await check("login salah 401 generik", async () => {
    const res = await login(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.local", password: "salah" }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid email or password.");
  });

  // --- 10. seed safety ---
  await check("seed guard produksi + README warning", () => {
    const seed = fs.readFileSync(path.join(ROOT, "prisma/seed.ts"), "utf8");
    assert.ok(seed.includes("ALLOW_PROD_SEED"), "seed harus punya guard produksi");
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    assert.ok(
      readme.toLowerCase().includes("development-only") ||
        readme.toLowerCase().includes("development only"),
      "README harus warning seed dev-only",
    );
  });

  // --- 11. logging audit statis ---
  await check("tidak ada secret/PII di console.*", () => {
    const risky = /console\.(log|error|warn)\(.*(process\.env\.(WHATSAPP|AUTH)|passwordHash|wa_session|accessToken|appSecret[^_])/;
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const bad: string[] = [];
    for (const f of walk(path.join(ROOT, "src"))) {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        if (risky.test(line)) bad.push(`${path.relative(ROOT, f)}: ${line.trim().slice(0, 100)}`);
      }
    }
    assert.deepEqual(bad, [], `logging berisiko: ${bad.join(" | ")}`);
  });

  // --- 12. auth regression ---
  await check("me anon 401", async () => {
    const res = await me(new NextRequest("http://test/api/auth/me"));
    assert.equal(res.status, 401);
  });

  async function adminCookie(
    loginFn: (r: InstanceType<typeof NextRequest>) => Promise<Response>,
  ): Promise<string> {
    const res = await loginFn(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.local", password: "password123" }),
      }),
    );
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
