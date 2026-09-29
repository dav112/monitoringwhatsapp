/**
 * Uji Customer & Conversation Workspace Step 8 (DB asli, login nyata).
 * USE: npm run test:workspace
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

async function main() {
  const { GET: getCustomer } = await import("../src/app/api/customers/[id]/route");
  const { GET: getMessages } = await import("../src/app/api/wa/messages/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { filterByCustomer, formatChatTime } = await import("../src/lib/wa-feed");
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
  const authed = (url: string, cookie?: string) =>
    new NextRequest(url, { headers: cookie ? { cookie } : {} });
  const custUrl = (id: string) => `http://test/api/customers/${id}`;

  // --- data temp: 1 customer + 35 pesan campuran + 4 tipe interaksi ---
  const customer = await prisma.customer.create({
    data: { name: "WS Probe", phone: "6281990007777", city: "Bogor", status: "FOLLOW_UP" },
  });
  const base = new Date("2026-02-01T10:00:00Z").getTime();
  const types = ["text", "text", "image", "audio", "text"] as const;
  for (let i = 0; i < 35; i++) {
    const t = types[i % types.length];
    await prisma.whatsAppMessage.create({
      data: {
        customerId: customer.id,
        messageId: `wamid.WS${i}`,
        phone: customer.phone,
        messageType: t,
        content: t === "text" ? `pesan ${i}` : t === "image" ? "[gambar]" : t === "audio" ? "[audio]" : "",
        direction: i % 7 === 6 ? "OUTBOUND" : "INBOUND",
        createdAt: new Date(base + i * 60000),
      },
    });
  }
  for (const [type, content] of [
    ["MESSAGE", "pesan 0"],
    ["CITY_DETECTED", "Bogor"],
    ["STATUS_CHANGED", "NEW → FOLLOW_UP"],
    ["NOTE", "catatan cs"],
  ] as const) {
    await prisma.customerInteraction.create({
      data: { customerId: customer.id, type, content },
    });
  }

  // --- auth ---
  await check("anon detail → 401, anon messages → 401", async () => {
    assert.equal((await getCustomer(authed(custUrl(customer.id)), { params: Promise.resolve({ id: customer.id }) })).status, 401);
    assert.equal((await getMessages(authed(`http://test/api/wa/messages?customerId=${customer.id}`))).status, 401);
  });
  await check("ADMIN/SUPERVISOR/CS boleh workspace", async () => {
    for (const c of [admin, supervisor, cs]) {
      const r = await getCustomer(authed(custUrl(customer.id), c), {
        params: Promise.resolve({ id: customer.id }),
      });
      assert.equal(r.status, 200);
      const m = await getMessages(
        authed(`http://test/api/wa/messages?customerId=${customer.id}&direction=all`, c),
      );
      assert.equal(m.status, 200);
    }
  });

  // --- customer ---
  await check("detail aman + 404 unknown", async () => {
    const res = await getCustomer(authed(custUrl(customer.id), admin), {
      params: Promise.resolve({ id: customer.id }),
    });
    const body = await res.text();
    const json = JSON.parse(body);
    assert.equal(json.data.customer.phone, "6281990007777");
    assert.equal(json.data.interactions.length, 4);
    for (const bad of ["passwordhash", "accesstoken", "appsecret", "auth_secret"]) {
      assert.ok(!body.toLowerCase().includes(bad), `bocor: ${bad}`);
    }
    const nf = await getCustomer(authed(custUrl("nope"), admin), {
      params: Promise.resolve({ id: "nope" }),
    });
    assert.equal(nf.status, 404);
  });

  // --- conversation ---
  await check("desc deterministik + direction filter", async () => {
    const all = await (
      await getMessages(
        authed(`http://test/api/wa/messages?customerId=${customer.id}&direction=all&limit=100`, admin),
      )
    ).json();
    assert.equal(all.data.length, 35);
    const times = all.data.map((m: { createdAt: string }) => m.createdAt);
    assert.deepEqual([...times].sort().reverse(), times, "harus desc");
    const inbound = await (
      await getMessages(authed(`http://test/api/wa/messages?customerId=${customer.id}`, admin))
    ).json();
    assert.ok(inbound.data.every((m: { direction: string }) => m.direction === "INBOUND"));
    assert.ok(inbound.data.length < 35, "outbound terfilter");
  });
  await check("cursor before membelah 35 pesan tanpa hilang/duplikat", async () => {
    const q = `customerId=${customer.id}&direction=all&limit=20`;
    const p1 = await (await getMessages(authed(`http://test/api/wa/messages?${q}`, admin))).json();
    assert.equal(p1.data.length, 20);
    assert.equal(p1.pageInfo.hasMore, true);
    const p2 = await (
      await getMessages(
        authed(`http://test/api/wa/messages?${q}&before=${encodeURIComponent(p1.pageInfo.before)}`, admin),
      )
    ).json();
    assert.equal(p2.data.length, 15);
    const ids = [...p1.data, ...p2.data].map((m: { id: string }) => m.id);
    assert.equal(new Set(ids).size, 35);
  });
  await check("limit dibatasi (tanpa unbounded)", async () => {
    const res = await getMessages(
      authed(`http://test/api/wa/messages?customerId=${customer.id}&direction=all&limit=999999`, admin),
    );
    assert.ok(((await res.json()).data.length as number) <= 100);
  });

  // --- realtime filtering murni ---
  await check("event customer lain diabaikan, milik sendiri lolos", () => {
    const evts = [
      { customerId: customer.id },
      { customerId: "lain" },
      { customerId: null },
    ] as never[];
    assert.equal(filterByCustomer(evts, customer.id).length, 1);
  });
  await check("formatChatTime WIB: hari ini/kemarin/lama/invalid", () => {
    const now = new Date("2026-03-02T01:00:00Z").getTime(); // 08:00 WIB
    assert.equal(formatChatTime("2026-03-02T00:30:00Z", now), "07.30");
    assert.ok(formatChatTime("2026-03-01T10:00:00Z", now).startsWith("Kemarin"));
    assert.ok(formatChatTime("2026-02-01T10:00:00Z", now).includes("2026"));
    assert.equal(formatChatTime("bukan-tanggal", now), "bukan-tanggal");
  });

  // --- cleanup ---
  await prisma.whatsAppMessage.deleteMany({ where: { customerId: customer.id } });
  await prisma.customerInteraction.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
