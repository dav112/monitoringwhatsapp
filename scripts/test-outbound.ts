/**
 * Uji CS Reply / Outbound Step 9 (DB asli, login nyata, Graph API di-mock).
 * USE: npm run test:outbound
 */
import "dotenv/config";
import assert from "node:assert/strict";

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

// Kredensial dummy via env (DB config kosong → fallback env).
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token-outbound";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789012345";

type Stub =
  | { kind: "ok"; id: string }
  | { kind: "reject"; status: number; json: unknown }
  | { kind: "throw"; name: "AbortError" | "Network" };

const stubs: Stub[] = [];
let graphCalls: { url: string; body: Record<string, unknown> }[] = [];
let metaCounter = 0;
const realFetch = globalThis.fetch;

function stubFetch() {
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown; signal?: AbortSignal }) => {
    const body = JSON.parse(String((init?.body as string) ?? "{}")) as Record<string, unknown>;
    graphCalls.push({ url: String(url), body });
    const s = stubs.shift() ?? { kind: "ok", id: `wamid.MOCK${++metaCounter}` };
    if (s.kind === "throw") {
      if (s.name === "AbortError") {
        await new Promise<void>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        });
        throw new Error("unreachable");
      }
      throw new Error("network down");
    }
    if (s.kind === "reject") {
      return new Response(JSON.stringify(s.json), { status: s.status });
    }
    return new Response(JSON.stringify({ messages: [{ id: s.id }] }), { status: 200 });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

async function main() {
  const { POST: sendMessage } = await import("../src/app/api/customers/[id]/messages/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { outboundAllowed } = await import("../src/lib/rate-limit");
  const { OUTBOUND_MAX_LENGTH } = await import("../src/lib/whatsapp/outbound");
  const { onFeedMessage } = await import("../src/lib/wa-events");
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  async function cookieOf(email: string, password: string): Promise<string> {
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
  const admin = await cookieOf(ADMIN.email, ADMIN.password);
  const supervisor = await cookieOf(SUPERVISOR.email, SUPERVISOR.password);
  const cs = await cookieOf(CS.email, CS.password);

  const customer = await prisma.customer.create({
    data: { name: "OB Probe", phone: "6281990008888", city: "Bogor", status: "NEW" },
  });
  const url = `http://test/api/customers/${customer.id}/messages`;
  const post = (body: unknown, cookie?: string) =>
    sendMessage(
      new NextRequest(url, {
        method: "POST",
        headers: {
          ...(cookie ? { cookie } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: customer.id }) },
    );

  stubFetch();
  try {
    // --- auth/RBAC ---
    await check("anon → 401", async () => {
      assert.equal((await post({ content: "halo" })).status, 401);
    });
    for (const [role, cookie] of [["ADMIN", admin], ["SUPERVISOR", supervisor], ["CS", cs]] as const) {
      await check(`${role} boleh kirim → 201`, async () => {
        const res = await post({ content: `halo dari ${role}`, clientMessageId: `key-${role}-1` }, cookie);
        assert.equal(res.status, 201);
        const json = await res.json();
        assert.equal(json.data.message.direction, "OUTBOUND");
        assert.ok(String(json.data.message.messageId).startsWith("wamid.MOCK"));
      });
    }

    // --- validasi ---
    await check("empty/whitespace/too-long/body-invalid → 400", async () => {
      assert.equal((await post({ content: "" }, admin)).status, 400);
      assert.equal((await post({ content: "   " }, admin)).status, 400);
      assert.equal((await post({ content: "x".repeat(OUTBOUND_MAX_LENGTH + 1) }, admin)).status, 400);
      assert.equal((await post({ content: 123 }, admin)).status, 400);
      assert.equal((await post({ clientMessageId: "!!!" , content: "ok" }, admin)).status, 400);
    });
    await check("invalid customer → 404", async () => {
      const res = await sendMessage(
        new NextRequest("http://test/api/customers/nope/messages", {
          method: "POST",
          headers: { cookie: admin, "Content-Type": "application/json" },
          body: JSON.stringify({ content: "halo" }),
        }),
        { params: Promise.resolve({ id: "nope" }) },
      );
      assert.equal(res.status, 404);
    });

    // --- security: phone/direction/messageId dari body diabaikan ---
    await check("phone dari body diabaikan (pakai DB)", async () => {
      graphCalls = [];
      const res = await post(
        {
          content: "uji override",
          phone: "6299999999999",
          direction: "INBOUND",
          messageId: "wamid.PALSU",
          customerId: "lain",
          clientMessageId: "key-override-1",
        },
        admin,
      );
      assert.equal(res.status, 201);
      const last = graphCalls[graphCalls.length - 1];
      assert.equal(last.body.to, "6281990008888");
      const json = await res.json();
      assert.equal(json.data.message.customerId, customer.id);
      assert.equal(json.data.message.direction, "OUTBOUND");
      assert.notEqual(json.data.message.messageId, "wamid.PALSU");
    });

    // --- sukses: persist + interaksi + tanpa ubah status ---
    await check("OUTBOUND + interaksi tersimpan, status tetap", async () => {
      const before = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      const res = await post({ content: "cek persist", clientMessageId: "key-persist-1" }, admin);
      assert.equal(res.status, 201);
      const json = await res.json();
      const row = await prisma.whatsAppMessage.findUniqueOrThrow({
        where: { messageId: json.data.message.messageId },
      });
      assert.equal(row.direction, "OUTBOUND");
      assert.equal(row.content, "cek persist");
      const inter = await prisma.customerInteraction.count({
        where: { customerId: customer.id, type: "MESSAGE", content: "cek persist" },
      });
      assert.equal(inter, 1);
      const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      assert.equal(after.status, before.status);
    });

    // --- Meta reject → tidak dianggap sukses, retry key sama bisa ---
    await check("Meta 400 → 502 + placeholder dibersihkan", async () => {
      stubs.push({ kind: "reject", status: 400, json: { error: { message: "bad", code: 400 } } });
      const bad = await post({ content: "gagal dulu", clientMessageId: "key-retry-1" }, admin);
      assert.equal(bad.status, 502);
      const leaked = await bad.text();
      assert.ok(!leaked.includes("test-access-token"));
      const ok = await post({ content: "gagal dulu", clientMessageId: "key-retry-1" }, admin);
      assert.equal(ok.status, 201);
    });

    // --- idempotency: key sama dua kali → 1 kirim ---
    await check("key sama 2x → 200 kedua, 1 external send", async () => {
      graphCalls = [];
      const first = await post({ content: "sekali saja", clientMessageId: "key-idem-1" }, admin);
      assert.equal(first.status, 201);
      const firstId = (await first.json()).data.message.id;
      const second = await post({ content: "sekali saja", clientMessageId: "key-idem-1" }, admin);
      assert.equal(second.status, 200);
      assert.equal((await second.json()).data.message.id, firstId);
      assert.equal(graphCalls.length, 1);
      assert.equal(
        await prisma.whatsAppMessage.count({ where: { clientMessageId: "key-idem-1" } }),
        1,
      );
    });

    // --- konkuren: 1 external send ---
    await check("3 konkuren key sama → 1 external send", async () => {
      graphCalls = [];
      const results = await Promise.all([
        post({ content: "balapan", clientMessageId: "key-race-1" }, admin),
        post({ content: "balapan", clientMessageId: "key-race-1" }, admin),
        post({ content: "balapan", clientMessageId: "key-race-1" }, admin),
      ]);
      const codes = results.map((r) => r.status).sort();
      assert.ok(codes[0] === 200 || codes[0] === 201);
      assert.ok(codes.every((c) => c === 200 || c === 201 || c === 409));
      assert.equal(graphCalls.length, 1);
      assert.equal(
        await prisma.whatsAppMessage.count({ where: { clientMessageId: "key-race-1" } }),
        1,
      );
    });

    // --- timeout ambiguous → 504, retry key sama → 409 (tanpa resend) ---
    await check("timeout → 504 + retry 409 tanpa resend", async () => {
      stubs.push({ kind: "throw", name: "AbortError" });
      const t0 = await post({ content: "ambigu", clientMessageId: "key-amb-1" }, admin);
      assert.equal(t0.status, 504);
      graphCalls = [];
      const t1 = await post({ content: "ambigu", clientMessageId: "key-amb-1" }, admin);
      assert.equal(t1.status, 409);
      assert.equal(graphCalls.length, 0);
    });

    // --- XSS: tersimpan apa adanya (React me-render text) ---
    await check("script tersimpan plain text", async () => {
      const res = await post(
        { content: "<script>alert(1)</script>", clientMessageId: "key-xss-1" },
        admin,
      );
      assert.equal(res.status, 201);
      assert.equal((await res.json()).data.message.content, "<script>alert(1)</script>");
    });

    // --- realtime: event OUTBOUND hanya untuk customer ini ---
    await check("emit OUTBOUND diterima subscriber", async () => {
      const seen: string[] = [];
      const off = onFeedMessage((m) => {
        seen.push(`${m.customerId}:${m.direction}`);
      });
      await post({ content: "realtime?", clientMessageId: "key-rt-1" }, admin);
      off();
      assert.ok(seen.includes(`${customer.id}:OUTBOUND`));
    });

    // --- rate limit unit ---
    await check("outboundAllowed batas 30/menit", () => {
      const u = "rate-u";
      const c = "rate-c";
      for (let i = 0; i < 30; i++) assert.equal(outboundAllowed(u, c), true);
      assert.equal(outboundAllowed(u, c), false);
    });

    // --- unconfigured → 503 ---
    await check("tanpa kredensial → 503 aman", async () => {
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      const res = await post({ content: "x", clientMessageId: "key-503-1" }, admin);
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error, "WhatsApp is not configured");
    });
  } finally {
    restoreFetch();
    await prisma.whatsAppMessage.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerInteraction.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    console.log("cleanup ok");
    await prisma.$disconnect();
  }

  console.log(`\n${passed} test lolos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
