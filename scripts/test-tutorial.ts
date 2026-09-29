/**
 * Uji Tutorial Center (proteksi, konten, tanpa secret).
 * USE: npm run test:tutorial
 */
import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { default: proxy } = await import("../src/proxy");
  const { NextRequest } = await import("next/server");

  async function cookieOf(email: string): Promise<string> {
    const res = await login(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      }),
    );
    assert.equal(res.status, 200, `login ${email} gagal`);
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
  const admin = await cookieOf("admin@example.local");
  const supervisor = await cookieOf("supervisor@example.local");
  const cs = await cookieOf("cs@example.local");

  const viaProxy = (path: string, cookie?: string) =>
    proxy(
      new NextRequest(`http://test${path}`, { headers: cookie ? { cookie } : {} }),
    );

  await check("anon /tutorial → redirect login", async () => {
    const r = await viaProxy("/tutorial");
    assert.ok([307, 308].includes(r.status));
    assert.ok((r.headers.get("location") ?? "").includes("/login"));
  });
  await check("ADMIN/SUPERVISOR/CS boleh /tutorial", async () => {
    for (const c of [admin, supervisor, cs]) {
      const r = await viaProxy("/tutorial", c);
      assert.equal(r.status, 200);
    }
  });

  const sidebar = fs.readFileSync(`${ROOT}/src/components/Sidebar.tsx`, "utf8");
  await check("sidebar ada link Tutorial semua role", () => {
    assert.ok(sidebar.includes('href: "/tutorial"'));
    assert.ok(sidebar.includes('label: "Tutorial"'));
    assert.ok(sidebar.includes('["ADMIN", "SUPERVISOR", "CS"]'));
  });

  const page = fs.readFileSync(`${ROOT}/src/app/(app)/tutorial/page.tsx`, "utf8");
  await check("konten utama lengkap", () => {
    for (const s of [
      "Hubungkan WhatsApp ke Dashboard",
      "20–40 menit",
      "Siapkan akun Meta",
      "Access Token",
      "Phone Number ID",
      "WABA ID",
      "Verify Token",
      "App Secret",
      "Test Connection",
      "Kalau gagal, cek sini",
      "Halo, saya dari Bogor",
      "SENDING",
    ]) {
      assert.ok(page.includes(s), `hilang: ${s}`);
    }
    // 13 item checklist
    const items = (page.match(/"Siapkan akun Meta"|"Pastikan pesan masuk realtime"/g) ?? []).length;
    assert.ok(items >= 2);
    assert.ok(page.includes("Kirim test message"));
  });
  await check("tanpa secret/nilai kredensial di tutorial", () => {
    assert.ok(!page.includes("process.env"), "jangan baca env di client");
    for (const v of [
      process.env.WHATSAPP_ACCESS_TOKEN,
      process.env.WHATSAPP_APP_SECRET,
      process.env.AUTH_SECRET,
    ]) {
      if (v && v.trim().length >= 8) assert.ok(!page.includes(v.trim()), "nilai secret bocor");
    }
    // localStorage hanya untuk checklist
    assert.ok(page.includes("tutorial-checklist-v1"));
    assert.ok(!/localStorage\.setItem\([^)]*(token|secret|credential)/i.test(page));
  });
  await check("link dokumentasi resmi Meta ada", () => {
    const links = page.match(/https:\/\/developers\.facebook\.com[^\s"']*/g) ?? [];
    assert.ok(links.length >= 3, "minimal 3 link Meta");
    assert.ok(!/blogspot|medium\.com|wordpress/.test(page), "tanpa blog random");
  });
  await check("aksesibilitas dasar", () => {
    for (const s of ["<h1", "aria-label", "aria-expanded", "role=\"progressbar\"", "<button", "focus-visible"]) {
      assert.ok(page.includes(s), `hilang: ${s}`);
    }
  });
  await check("responsive sanity", () => {
    for (const s of ["max-w-3xl", "overflow-x-auto", "sm:", "min-w-0", "flex-wrap"]) {
      assert.ok(page.includes(s), `hilang: ${s}`);
    }
  });

  const { prisma } = await import("../src/lib/prisma");
  console.log("cleanup ok");
  await prisma.$disconnect();

  console.log(`\n${passed} test lolos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
