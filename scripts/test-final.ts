/**
 * Final QA gerbang rilis Step 13 (non-destruktif).
 * USE: npm run test:final
 * Cakupan: migrasi, health, proteksi auth, matriks mutasi, secret guard,
 * endpoint, integritas DB, scan performa/SSE/konfig produksi.
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

async function main() {
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  async function cookieOf(email: string, password: string): Promise<string> {
    const { POST: login } = await import("../src/app/api/auth/login/route");
    const res = await login(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    assert.equal(res.status, 200, `login ${email} gagal`);
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
  const admin = await cookieOf("admin@example.local", "password123");
  const cs = await cookieOf("cs@example.local", "password123");
  const authed = (url: string, cookie?: string, method = "GET", body?: unknown) =>
    new NextRequest(url, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // --- migrasi ---
  await check("prisma migrate status up to date", () => {
    const out = execFileSync("node_modules/.bin/prisma", ["migrate", "status"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.ok(out.includes("up to date"), out.slice(0, 200));
  });

  // --- health ---
  await check("health publik aman", async () => {
    const { GET: health } = await import("../src/app/api/health/route");
    const res = await health();
    assert.equal(res.status, 200);
    const body = await res.text();
    for (const k of ["AUTH_SECRET", "WHATSAPP_CONFIG_ENCRYPTION_KEY", "DATABASE_URL"]) {
      const v = process.env[k]?.trim() ?? "";
      if (v.length >= 8) assert.ok(!body.includes(v), `nilai ${k} bocor`);
    }
  });

  // --- matriks mutasi: anon 401, CS 403 pada admin-only, admin 200 ---
  await check("matriks mutasi RBAC", async () => {
    const { PATCH: patchUser } = await import("../src/app/api/users/[id]/route");
    const { PATCH: patchWa } = await import("../src/app/api/wa/config/route");
    const { POST: testConn } = await import("../src/app/api/wa/test-connection/route");
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.local" },
    });
    const withId = (base: string, cookie?: string, body?: unknown) =>
      authed(base, cookie, "PATCH", body);
    // anon → 401
    assert.equal(
      (await patchUser(withId("http://test/x"), { params: Promise.resolve({ id: "x" }) })).status,
      401,
    );
    // CS → 403 (bukan admin endpoint)
    assert.equal(
      (
        await patchUser(withId("http://test/x", cs, { status: "ACTIVE" }), {
          params: Promise.resolve({ id: adminUser.id }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await patchWa(authed("http://test/x", cs, "PATCH", {}))).status,
      403,
    );
    assert.equal(
      (await testConn(authed("http://test/x", cs, "POST"))).status,
      403,
    );
    // body manipulation: role/passwordHash ditolak sebagai field tak dikenal
    const bad = await patchWa(
      authed("http://test/x", admin, "PATCH", { role: "ADMIN", passwordHash: "x" }),
      // ^ route wa/config menolak key tak dikenal → 400
    );
    assert.equal(bad.status, 400);
  });

  // --- customer PATCH/DELETE matrix via temp customer ---
  await check("customer mutation matrix + XSS tersimpan text", async () => {
    const { PATCH, DELETE } = await import("../src/app/api/customers/[id]/route");
    const tmp = await prisma.customer.create({
      data: { name: "QA Temp", phone: "6281990001212", city: "Bogor", status: "NEW" },
    });
    const ctx = { params: Promise.resolve({ id: tmp.id }) };
    assert.equal(
      (await PATCH(authed("http://test/x", undefined, "PATCH", { city: "Depok" }), ctx)).status,
      401,
    );
    assert.equal(
      (await PATCH(authed("http://test/x", cs, "PATCH", { city: "Depok" }), ctx)).status,
      200,
    );
    // XSS valid secara panjang → 200 dan tersimpan apa adanya (dirender text oleh React)
    const xss = '<img src=x onerror=alert(1)>';
    const pr = await PATCH(authed("http://test/x", admin, "PATCH", { city: xss }), ctx);
    assert.equal(pr.status, 200);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: tmp.id } })).city, xss);
    // DELETE: CS punya akses customers penuh → 200; temp terhapus
    assert.equal((await DELETE(authed("http://test/x", cs), ctx)).status, 200);
    assert.equal(await prisma.customer.findUnique({ where: { id: tmp.id } }), null);
  });

  // --- secret repo scan (presisi: bedakan contoh/docs/test-dummy vs secret asli) ---
  await check("repo bebas secret hardcoded", () => {
    const bad: string[] = [];
    const isIgnored = (rel: string): boolean => {
      try {
        execFileSync("git", ["check-ignore", rel], { cwd: ROOT, stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    };
    const isTracked = (rel: string): boolean => {
      try {
        const out = execFileSync("git", ["ls-files", "--", rel], {
          cwd: ROOT,
          encoding: "utf8",
        });
        return out.trim().length > 0;
      } catch {
        return false;
      }
    };
    // 1. File sensitif lokal wajib ignored + untracked.
    for (const rel of [".env", ...fs.readdirSync(path.join(ROOT, "backups")).map((f) => `backups/${f}`)]) {
      if (!isIgnored(rel)) bad.push(`${rel} tidak di-ignore Git`);
      if (isTracked(rel)) bad.push(`${rel} ter-track di Git`);
    }
    // 2. .env.example: key secret harus KOSONG.
    const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const line of example.split("\n")) {
      const m = line.match(
        /^\s*(WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN|AUTH_SECRET|WHATSAPP_CONFIG_ENCRYPTION_KEY)\s*=\s*(.+?)\s*$/,
      );
      if (m && !m[2].startsWith("#")) bad.push(`.env.example bernilai: ${m[1]}`);
    }
    // 3. src/ + prisma/: tanpa literal KEY=<nilai> dan tanpa password seed,
    // kecuali prisma/seed.ts (dev seed terdokumentasi + guard produksi).
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
      }
      return out;
    };
    for (const f of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "prisma"))]) {
      const rel = path.relative(ROOT, f);
      const content = fs.readFileSync(f, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(
          /(WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN|AUTH_SECRET|WHATSAPP_CONFIG_ENCRYPTION_KEY)\s*=\s*["']?([^"'\s}]+)["']?/,
        );
        if (m && !m[2].startsWith("#") && m[2].length > 0) {
          bad.push(`${rel}: assignment bernilai (${m[1]})`);
        }
        // src/lib/env.ts memuat daftar weak-value terdokumentasi; seed.ts dev seed berguard.
        if (
          /password123/.test(line) &&
          rel !== "prisma/seed.ts" &&
          rel !== "src/lib/env.ts"
        ) {
          bad.push(`${rel}: password seed di luar seed.ts`);
        }
      }
    }
    assert.deepEqual(bad, [], bad.join(" | "));
  });

  // --- integritas DB ---
  await check("integritas: tanpa orphan/duplikat-unik", async () => {
    // FK mencegah orphan; verifikasi duplikat pada kolom unique.
    const dupMsg = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM (SELECT "messageId" FROM whatsapp_messages WHERE "messageId" IS NOT NULL GROUP BY "messageId" HAVING COUNT(*) > 1) t`;
    assert.equal(Number(dupMsg[0].c), 0, "duplikat messageId");
    const dupClient = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM (SELECT "clientMessageId" FROM whatsapp_messages WHERE "clientMessageId" IS NOT NULL GROUP BY "clientMessageId" HAVING COUNT(*) > 1) t`;
    assert.equal(Number(dupClient[0].c), 0, "duplikat clientMessageId");
    const dupPhone = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM (SELECT phone FROM customers GROUP BY phone HAVING COUNT(*) > 1) t`;
    assert.equal(Number(dupPhone[0].c), 0, "duplikat phone");
  });

  // --- scan performa: findMany harus ber-limit ---
  await check("findMany ber-limit (allowlist kecil)", () => {
    const allowlist = new Set([
      "src/app/api/users/route.ts", // tabel user kecil (admin-managed)
      "src/app/api/settings/route.ts", // 6 baris settings
    ]);
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
      const rel = path.relative(ROOT, f);
      if (allowlist.has(rel)) continue;
      const src = fs.readFileSync(f, "utf8");
      let idx = 0;
      while ((idx = src.indexOf(".findMany(", idx)) >= 0) {
        // ambil blok hingga kurung seimbang
        let depth = 0;
        let j = idx + ".findMany".length;
        let end = j;
        for (; j < src.length; j++) {
          if (src[j] === "(") depth++;
          else if (src[j] === ")") {
            depth--;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
        const block = src.slice(idx, end);
        if (!/take\s*:/.test(block)) bad.push(`${rel}: findMany tanpa take`);
        idx = end + 1;
      }
    }
    assert.deepEqual(bad, [], bad.join(" | "));
  });

  // --- SSE cleanup statis ---
  await check("SSE cleanup ada (clearInterval + unsubscribe)", () => {
    const sse = fs.readFileSync(
      path.join(ROOT, "src/app/api/wa/messages/stream/route.ts"),
      "utf8",
    );
    assert.ok(sse.includes("clearInterval"), "heartbeat cleanup");
    assert.ok(sse.includes("unsubscribe"), "listener cleanup");
    const feed = fs.readFileSync(
      path.join(ROOT, "src/components/LiveMessageFeed.tsx"),
      "utf8",
    );
    assert.ok(feed.includes("es?.close()"), "EventSource cleanup");
    assert.ok(feed.includes("document.hidden"), "tab-hidden behavior");
  });

  // --- konfig produksi ---
  await check("konfig produksi aman", () => {
    const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const k of ["AUTH_SECRET=", "WHATSAPP_CONFIG_ENCRYPTION_KEY=", "DATABASE_URL="]) {
      assert.ok(example.includes(k), `${k} wajib di .env.example`);
    }
    assert.ok(!example.includes("NEXT_PUBLIC_"), "tanpa NEXT_PUBLIC secret");
    const authSecret = process.env.AUTH_SECRET ?? "";
    assert.ok(authSecret.length >= 32, "AUTH_SECRET min 32");
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gi.includes("/backups/"), "backups di-ignore");
  });

  // --- cleanup QA temp ---
  await prisma.customer.deleteMany({ where: { phone: "6281990001212" } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
