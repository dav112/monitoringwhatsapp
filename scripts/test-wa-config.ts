/**
 * Uji keamanan konfigurasi WhatsApp Step 4A/4B (DB asli, kredensial dummy).
 * Auth memakai login nyata (session cookie) — TANPA dev bypass.
 * USE: npm run test:wa-config
 */
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Kunci enkripsi acak khusus run ini (tidak menyentuh .env).
process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

const T = {
  accessToken: "test-access-token-xyz123",
  verifyToken: "test-verify-token-abc",
  appSecret: "test-app-secret-12345678",
  phoneNumberId: "123456789012345",
  businessAccountId: "987654321098765",
};

const ACCOUNTS = {
  ADMIN: { email: "admin@example.local", password: "password123" },
  SUPERVISOR: { email: "supervisor@example.local", password: "password123" },
  CS: { email: "cs@example.local", password: "password123" },
} as const;

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
  const { encryptSecret, decryptSecret, isEncryptedValue } = await import("../src/lib/crypto");
  const { getEffectiveConfig, getConfigStatus } = await import(
    "../src/lib/whatsapp/config"
  );
  const { GET: getConfig, PATCH: patchConfig } = await import("../src/app/api/wa/config/route");
  const { GET: getStatus } = await import("../src/app/api/wa/status/route");
  const { POST: testConn } = await import("../src/app/api/wa/test-connection/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  async function loginCookie(role: keyof typeof ACCOUNTS): Promise<string> {
    const res = await login(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ACCOUNTS[role]),
      }),
    );
    assert.equal(res.status, 200, `login ${role} gagal`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const session = setCookie.split(";")[0];
    assert.ok(session.startsWith("wa_session="), "cookie session tidak ada");
    return session;
  }

  const adminCookie = await loginCookie("ADMIN");
  const supervisorCookie = await loginCookie("SUPERVISOR");
  const csCookie = await loginCookie("CS");

  const req = (body?: unknown, cookie?: string) =>
    new NextRequest("http://test/api/wa/config", {
      method: body === undefined ? "GET" : "PATCH",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // --- enkripsi ---
  await check("encrypt/decrypt roundtrip", () => {
    const enc = encryptSecret(T.accessToken);
    assert.ok(isEncryptedValue(enc));
    assert.equal(decryptSecret(enc), T.accessToken);
  });
  await check("IV acak (cipher berbeda tiap enkripsi)", () => {
    assert.notEqual(encryptSecret("sama"), encryptSecret("sama"));
  });
  await check("key salah tidak bisa dekripsi", () => {
    const enc = encryptSecret("rahasia");
    process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    assert.throws(() => decryptSecret(enc));
  });

  // Key final untuk sisa test (key di atas sudah diganti).
  process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

  // --- simpan awal (ADMIN) ---
  await check("ADMIN dapat menyimpan (Test 8)", async () => {
    const res = await patchConfig(req({ ...T }, adminCookie));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.accessTokenConfigured, true);
    assert.equal(json.data.verifyTokenConfigured, true);
    assert.equal(json.data.appSecretConfigured, true);
  });

  // --- Test 5: DB terenkripsi ---
  await check("DB berisi ciphertext, bukan plaintext (Test 5)", async () => {
    const row = await prisma.whatsappConfig.findUnique({ where: { id: "global" } });
    assert.ok(row);
    const blob = JSON.stringify(row);
    for (const v of [T.accessToken, T.verifyToken, T.appSecret]) {
      assert.ok(!blob.includes(v), `plaintext bocor di DB: ${v.slice(0, 8)}...`);
    }
    assert.ok(isEncryptedValue(row!.accessTokenEncrypted));
    assert.ok(isEncryptedValue(row!.verifyTokenEncrypted));
    assert.ok(isEncryptedValue(row!.appSecretEncrypted));
    assert.equal(row!.phoneNumberId, T.phoneNumberId);
  });

  // --- Test 1: GET config aman ---
  await check("GET config tanpa secret (Test 1)", async () => {
    const res = await getConfig(
      new NextRequest("http://test/api/wa/config", { headers: { cookie: adminCookie } }),
    );
    const body = await res.text();
    for (const v of [T.accessToken, T.verifyToken, T.appSecret]) {
      assert.ok(!body.includes(v), "secret bocor di GET config");
    }
    assert.ok(!body.toLowerCase().includes("encryption_key"));
  });

  // --- Test 2: status aman (butuh session; anonim harus 401) ---
  await check("GET status tanpa secret (Test 2)", async () => {
    const res = await getStatus(
      new NextRequest("http://test/api/wa/status", { headers: { cookie: adminCookie } }),
    );
    const body = await res.text();
    for (const v of [T.accessToken, T.verifyToken, T.appSecret]) {
      assert.ok(!body.includes(v), "secret bocor di status");
    }
  });
  await check("GET status anonim → 401", async () => {
    const res = await getStatus(new NextRequest("http://test/api/wa/status"));
    assert.equal(res.status, 401);
  });

  // --- Test 6/7: role guard (session nyata) ---
  await check("CS tidak dapat PATCH (Test 6)", async () => {
    const res = await patchConfig(req({ phoneNumberId: "111" }, csCookie));
    assert.equal(res.status, 403);
  });
  await check("Supervisor tidak dapat PATCH (Test 7)", async () => {
    const res = await patchConfig(req({ phoneNumberId: "111" }, supervisorCookie));
    assert.equal(res.status, 403);
  });
  await check("tanpa session → 401", async () => {
    const res = await patchConfig(req({ phoneNumberId: "111" }));
    assert.equal(res.status, 401);
  });

  // --- Test 9: field kosong pertahankan lama ---
  await check("secret kosong tidak menghapus lama (Test 9)", async () => {
    const res = await patchConfig(
      req({ accessToken: "", verifyToken: "", phoneNumberId: "" }, adminCookie),
    );
    assert.equal(res.status, 200);
    const eff = await getEffectiveConfig();
    assert.equal(eff.accessToken, T.accessToken);
    assert.equal(eff.verifyToken, T.verifyToken);
    assert.equal(eff.phoneNumberId, T.phoneNumberId);
  });

  // --- Test 10: clear eksplisit ---
  await check("clear menghapus credential (Test 10)", async () => {
    const res = await patchConfig(req({ clear: ["accessToken", "phoneNumberId"] }, adminCookie));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.accessTokenConfigured, false);
    assert.equal(json.data.phoneNumberIdConfigured, false);
    assert.equal(json.data.verifyTokenConfigured, true); // tidak ikut terhapus
  });

  // --- validasi ---
  await check("token terlalu pendek ditolak", async () => {
    const res = await patchConfig(req({ accessToken: "pendek" }, adminCookie));
    assert.equal(res.status, 400);
  });
  await check("phoneNumberId non-angka ditolak", async () => {
    const res = await patchConfig(req({ phoneNumberId: "abc" }, adminCookie));
    assert.equal(res.status, 400);
  });
  await check("field tak dikenal ditolak", async () => {
    const res = await patchConfig(req({ accessTokenX: "x" }, adminCookie));
    assert.equal(res.status, 400);
  });

  // --- test-connection aman (kredensial dummy → unreachable, tanpa bocor token) ---
  await check("test-connection tanpa bocor token", async () => {
    const res = await testConn(
      new NextRequest("http://test/api/wa/test-connection", {
        method: "POST",
        headers: { cookie: adminCookie },
      }),
    );
    const body = await res.text();
    assert.ok(!body.includes(T.accessToken), "token bocor di test-connection");
    const json = JSON.parse(body);
    assert.equal(typeof json.data.reachable, "boolean");
  });
  await check("test-connection ditolak untuk CS", async () => {
    const res = await testConn(
      new NextRequest("http://test/api/wa/test-connection", {
        method: "POST",
        headers: { cookie: csCookie },
      }),
    );
    assert.equal(res.status, 403);
  });

  // --- status flags konsisten ---
  await check("status flags hanya boolean aman", async () => {
    const s = await getConfigStatus();
    assert.equal(typeof s.configured, "boolean");
    assert.ok(!("accessToken" in s));
  });

  // --- cleanup: hapus baris config test ---
  await prisma.whatsappConfig.deleteMany({ where: { id: "global" } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
