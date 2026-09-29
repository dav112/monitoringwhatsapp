/**
 * Uji realtime monitoring Step 6 (DB asli, login nyata).
 * USE: npm run test:realtime
 */
import "dotenv/config";
import assert from "node:assert/strict";
import type { FeedMessage } from "../src/lib/wa-feed";

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
  const { GET: getMessages } = await import("../src/app/api/wa/messages/route");
  const { GET: getStream } = await import("../src/app/api/wa/messages/stream/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { POST: inboundWebhook } = await import("../src/app/api/wa/webhook/route");
  const {
    encodeCursor,
    decodeCursor,
    mergeFeedMessages,
    messagePreview,
    timeAgo,
  } = await import("../src/lib/wa-feed");
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
  const get = (path: string, cookie?: string) =>
    new NextRequest(`http://test${path}`, { headers: cookie ? { cookie } : {} });

  // --- auth + roles ---
  await check("anon messages → 401, anon stream → 401", async () => {
    assert.equal((await getMessages(get("/api/wa/messages"))).status, 401);
    assert.equal((await getStream(get("/api/wa/messages/stream"))).status, 401);
  });
  await check("ADMIN/SUPERVISOR/CS boleh monitoring", async () => {
    for (const c of [admin, supervisor, cs]) {
      const r = await getMessages(get("/api/wa/messages?limit=5", c));
      assert.equal(r.status, 200);
    }
  });

  // --- data temp ---
  const customer = await prisma.customer.create({
    data: { name: "RT Probe", phone: "6281990004444", city: "Bogor", status: "NEW" },
  });
  const base = new Date("2026-01-01T10:00:00Z").getTime();
  const mkMsg = (i: number, direction: "INBOUND" | "OUTBOUND", content: string) =>
    prisma.whatsAppMessage.create({
      data: {
        customerId: customer.id,
        messageId: `wamid.RT${i}`,
        phone: customer.phone,
        messageType: "text",
        content,
        direction,
        createdAt: new Date(base + i * 60000),
      },
    });
  await mkMsg(1, "INBOUND", "satu");
  await mkMsg(2, "INBOUND", "dua");
  await mkMsg(3, "OUTBOUND", "tiga-out");
  await mkMsg(4, "INBOUND", "empat");
  await mkMsg(5, "INBOUND", "lima");

  // --- query ---
  await check("latest default INBOUND, terbaru dulu", async () => {
    const res = await getMessages(get("/api/wa/messages?limit=10", admin));
    const json = await res.json();
    const rows = json.data.filter(
      (m: FeedMessage) => m.customerId === customer.id,
    ) as FeedMessage[];
    assert.deepEqual(
      rows.map((m) => m.content),
      ["lima", "empat", "dua", "satu"],
    );
  });
  await check("direction=all memuat OUTBOUND; customer terisi", async () => {
    const res = await getMessages(
      get(`/api/wa/messages?direction=all&customerId=${customer.id}`, admin),
    );
    const json = await res.json();
    assert.equal(json.data.length, 5);
    assert.ok(
      json.data.every(
        (m: FeedMessage) => m.customer?.name === "RT Probe" && m.customer?.phone === customer.phone,
      ),
    );
  });
  await check("cursor before/after stabil", async () => {
    const first = await (
      await getMessages(get(`/api/wa/messages?direction=all&customerId=${customer.id}&limit=2`, admin))
    ).json();
    assert.deepEqual(
      first.data.map((m: FeedMessage) => m.content),
      ["lima", "empat"],
    );
    assert.equal(first.pageInfo.hasMore, true);
    const older = await (
      await getMessages(
        get(
          `/api/wa/messages?direction=all&customerId=${customer.id}&limit=2&before=${encodeURIComponent(first.pageInfo.before)}`,
          admin,
        ),
      )
    ).json();
    assert.deepEqual(
      older.data.map((m: FeedMessage) => m.content),
      ["tiga-out", "dua"],
    );
    const newest = first.data[0] as FeedMessage;
    const cursor = encodeCursor(newest.createdAt, newest.id);
    const noneRes = await getMessages(
      get(
        `/api/wa/messages?direction=all&customerId=${customer.id}&after=${encodeURIComponent(cursor)}`,
        admin,
      ),
    );
    assert.deepEqual((await noneRes.json()).data, []);
  });
  await check("pesan baru terdeteksi via after", async () => {
    const before = await (
      await getMessages(get(`/api/wa/messages?direction=all&customerId=${customer.id}&limit=1`, admin))
    ).json();
    const cursor = encodeCursor(before.data[0].createdAt, before.data[0].id);
    await mkMsg(6, "INBOUND", "enam-baru");
    const res = await getMessages(
      get(
        `/api/wa/messages?direction=all&customerId=${customer.id}&after=${encodeURIComponent(cursor)}`,
        admin,
      ),
    );
    const rows = (await res.json()).data as FeedMessage[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].content, "enam-baru");
  });
  await check("limit dibatasi + select minimal + tanpa secret", async () => {
    const res = await getMessages(get("/api/wa/messages?limit=1000000", admin));
    const body = await res.text();
    assert.ok((JSON.parse(body).data.length as number) <= 100);
    for (const bad of ["passwordhash", "accesstoken", "appsecret", "auth_secret", "wa_session"]) {
      assert.ok(!body.toLowerCase().includes(bad), `bocor: ${bad}`);
    }
    const one = JSON.parse(body).data[0] as Record<string, unknown>;
    const keys = new Set(Object.keys(one));
    assert.ok(!keys.has("passwordHash"));
    assert.ok(keys.has("customer") && keys.has("content") && keys.has("direction"));
  });
  await check("cursor invalid → 400; direction invalid → 400", async () => {
    assert.equal((await getMessages(get("/api/wa/messages?before=xxx", admin))).status, 400);
    assert.equal((await getMessages(get("/api/wa/messages?direction=salah", admin))).status, 400);
  });

  // --- helper murni ---
  await check("cursor roundtrip + invalid null", () => {
    const c = encodeCursor("2026-01-01T10:00:00.000Z", "abc");
    const d = decodeCursor(c);
    assert.ok(d && d.id === "abc");
    assert.equal(decodeCursor("!!!"), null);
  });
  await check("merge dedupe + urut terbaru dulu", () => {
    const m = (id: string, iso: string): FeedMessage => ({
      id,
      messageId: id,
      customerId: null,
      customer: null,
      messageType: "text",
      content: id,
      direction: "INBOUND",
      status: null,
      statusDetail: null,
      createdAt: iso,
    });
    const merged = mergeFeedMessages(
      [m("a", "2026-01-01T10:00:00Z")],
      [m("a", "2026-01-01T10:00:00Z"), m("b", "2026-01-01T10:01:00Z")],
    );
    assert.deepEqual(merged.map((x) => x.id), ["b", "a"]);
  });
  await check("preview aman untuk non-text/kosong + timeAgo", () => {
    assert.equal(
      messagePreview({ messageType: "image", content: "" }),
      "Pesan image",
    );
    assert.equal(messagePreview({ messageType: "text", content: " hi " }), "hi");
    assert.equal(timeAgo(new Date(Date.now() - 45000).toISOString()), "45 detik lalu");
    assert.equal(timeAgo(new Date(Date.now() - 3000).toISOString()), "baru saja");
  });

  // --- SSE live ---
  await check("SSE: connected + event message live dari webhook", async () => {
    const res = await getStream(get("/api/wa/messages/stream", admin));
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") ?? "").includes("text/event-stream"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const readEvent = async (timeoutMs: number): Promise<string | null> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) return null;
        buf += decoder.decode(value, { stream: true });
        const idx = buf.indexOf("\n\n");
        if (idx >= 0) {
          const ev = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          return ev;
        }
      }
      return null;
    };
    const first = await readEvent(5000);
    assert.ok(first?.startsWith("event: connected"), `event pertama: ${first}`);

    // Kirim webhook asli (tanpa session) → harus muncul sebagai event message.
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "RT Live" }, wa_id: "6281990005555" }],
                messages: [
                  {
                    from: "6281990005555",
                    id: "wamid.RTLIVE1",
                    timestamp: "1727000000",
                    type: "text",
                    text: { body: "halo live kak" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const post = await inboundWebhook(
      new NextRequest("http://test/api/wa/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    assert.equal(post.status, 200);
    const ev = await readEvent(8000);
    assert.ok(ev?.startsWith("event: message"), `event kedua: ${ev}`);
    assert.ok(ev!.includes("wamid.RTLIVE1") && ev!.includes("halo live kak"));
    await reader.cancel();

    await prisma.customer.deleteMany({ where: { phone: "6281990005555" } });
    await prisma.whatsAppMessage.deleteMany({ where: { messageId: "wamid.RTLIVE1" } });
  });

  // --- idempotency konkuren: 3x POST serentak, messageId sama ---
  await check("webhook konkuren idempotent (1 pesan, 1 customer)", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "RT Race" }, wa_id: "6281990006666" }],
                messages: [
                  {
                    from: "6281990006666",
                    id: "wamid.RTRACE1",
                    timestamp: "1727000000",
                    type: "text",
                    text: { body: "balapan kak" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const post = () =>
      inboundWebhook(
        new NextRequest("http://test/api/wa/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    const results = await Promise.all([post(), post(), post()]);
    assert.ok(results.every((r) => r.status === 200), "semua harus 200");
    assert.equal(
      await prisma.whatsAppMessage.count({ where: { messageId: "wamid.RTRACE1" } }),
      1,
      "tepat 1 pesan",
    );
    assert.equal(
      await prisma.customer.count({ where: { phone: "6281990006666" } }),
      1,
      "tepat 1 customer",
    );
    const cust = await prisma.customer.findUniqueOrThrow({
      where: { phone: "6281990006666" },
    });
    assert.equal(
      await prisma.customerInteraction.count({
        where: { customerId: cust.id, type: "MESSAGE" },
      }),
      1,
      "tepat 1 interaksi MESSAGE",
    );
    await prisma.customer.delete({ where: { id: cust.id } });
    await prisma.whatsAppMessage.deleteMany({ where: { messageId: "wamid.RTRACE1" } });
  });

  // --- cleanup ---
  await prisma.whatsAppMessage.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
