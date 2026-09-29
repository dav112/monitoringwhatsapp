/**
 * Uji lifecycle status pesan Step 10 (DB asli, webhook route nyata).
 * USE: npm run test:message-status
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

function statusPayload(messageId: string, status: string, withError = false) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: "6281990009999",
                  ...(withError
                    ? { errors: [{ code: 131026, message: "Record not found" }] }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const { POST: inboundWebhook } = await import("../src/app/api/wa/webhook/route");
  const { GET: getMessages } = await import("../src/app/api/wa/messages/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { parseStatusUpdates } = await import("../src/lib/whatsapp/webhook");
  const { onStatusEvent } = await import("../src/lib/wa-events");
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  const loginRes = await login(
    new NextRequest("http://test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.local", password: "password123" }),
    }),
  );
  assert.equal(loginRes.status, 200);
  const admin = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];

  const post = (payload: unknown, sig: string | null = null) =>
    inboundWebhook(
      new NextRequest("http://test/api/wa/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sig ? { "X-Hub-Signature-256": sig } : {}),
        },
        body: JSON.stringify(payload),
      }),
    );

  const customer = await prisma.customer.create({
    data: { name: "ST Probe", phone: "6281990009999", city: "Bogor", status: "NEW" },
  });
  const mkOutbound = (messageId: string, status: "SENT" | "SENDING" = "SENT") =>
    prisma.whatsAppMessage.create({
      data: {
        customerId: customer.id,
        messageId,
        phone: customer.phone,
        messageType: "text",
        content: "status probe",
        direction: "OUTBOUND",
        status,
      },
    });
  const readStatus = async (messageId: string) =>
    (
      await prisma.whatsAppMessage.findUniqueOrThrow({ where: { messageId } })
    ).status;
  const interactionCount = () =>
    prisma.customerInteraction.count({ where: { customerId: customer.id } });

  await mkOutbound("wamid.ST1");
  await prisma.customerInteraction.create({
    data: { customerId: customer.id, type: "MESSAGE", content: "status probe" },
  });
  const Trafford0 = await interactionCount();

  // --- signature (APP_SECRET kosong di dev → dilewati; paksa via env) ---
  await check("parse: unknown status lolos parse, entry rusak diskip", () => {
    const parsed = parseStatusUpdates({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messaging_product: "whatsapp", statuses: [{ id: "a", status: "weird_new_thing" }] } }] }],
    });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].status, "weird_new_thing");
    assert.deepEqual(parseStatusUpdates({ object: "page", entry: [] }), []);
    assert.deepEqual(
      parseStatusUpdates({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { messaging_product: "whatsapp", statuses: [{ noId: 1 }] } }] }],
      }),
      [],
    );
  });

  await check("SENT→DELIVERED→READ progresif", async () => {
    assert.equal((await post(statusPayload("wamid.ST1", "sent"))).status, 200);
    // sudah SENT → no-op tetap SENT
    assert.equal(await readStatus("wamid.ST1"), "SENT");
    assert.equal((await post(statusPayload("wamid.ST1", "delivered"))).status, 200);
    assert.equal(await readStatus("wamid.ST1"), "DELIVERED");
    assert.equal((await post(statusPayload("wamid.ST1", "read"))).status, 200);
    assert.equal(await readStatus("wamid.ST1"), "READ");
    assert.equal(await interactionCount(), Trafford0, "tanpa interaksi baru");
  });

  await check("out-of-order tidak downgrade (READ→DELIVERED→SENT tetap READ)", async () => {
    assert.equal((await post(statusPayload("wamid.ST1", "delivered"))).status, 200);
    assert.equal((await post(statusPayload("wamid.ST1", "sent"))).status, 200);
    assert.equal(await readStatus("wamid.ST1"), "READ");
  });

  await check("FAILED terminal: FAILED→SENT diabaikan", async () => {
    await mkOutbound("wamid.ST2");
    assert.equal((await post(statusPayload("wamid.ST2", "failed", true))).status, 200);
    assert.equal(await readStatus("wamid.ST2"), "FAILED");
    const failedRow = await prisma.whatsAppMessage.findUniqueOrThrow({
      where: { messageId: "wamid.ST2" },
    });
    assert.ok(String(failedRow.statusDetail ?? "").includes("131026"));
    assert.equal((await post(statusPayload("wamid.ST2", "sent"))).status, 200);
    assert.equal(await readStatus("wamid.ST2"), "FAILED");
  });

  await check("DELIVERED→FAILED diizinkan; duplikat idempoten", async () => {
    await mkOutbound("wamid.ST3");
    await post(statusPayload("wamid.ST3", "delivered"));
    await post(statusPayload("wamid.ST3", "failed", true));
    assert.equal(await readStatus("wamid.ST3"), "FAILED");
    const n0 = await interactionCount();
    await post(statusPayload("wamid.ST3", "failed", true));
    await post(statusPayload("wamid.ST3", "failed", true));
    assert.equal(await readStatus("wamid.ST3"), "FAILED");
    assert.equal(await interactionCount(), n0, "duplikat tanpa side effect");
  });

  await check("unknown messageId + unknown status → 200 diabaikan", async () => {
    assert.equal((await post(statusPayload("wamid.TIDAKADA", "delivered"))).status, 200);
    assert.equal((await post(statusPayload("wamid.ST1", "weird_new_thing"))).status, 200);
    assert.equal(await readStatus("wamid.ST1"), "READ");
  });

  await check("status untuk INBOUND tidak overwrite", async () => {
    const inbound = await prisma.whatsAppMessage.create({
      data: {
        customerId: customer.id,
        messageId: "wamid.STIN",
        phone: customer.phone,
        messageType: "text",
        content: "masuk",
        direction: "INBOUND",
        status: null,
      },
    });
    assert.equal((await post(statusPayload("wamid.STIN", "read"))).status, 200);
    const after = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: inbound.id } });
    assert.equal(after.status, null);
  });

  await check("event message_status hanya berisi field aman", async () => {
    const seen: string[] = [];
    const off = onStatusEvent((ev) => {
      seen.push(JSON.stringify(ev));
    });
    await mkOutbound("wamid.ST4");
    await post(statusPayload("wamid.ST4", "delivered"));
    off();
    assert.equal(seen.length, 1);
    const ev = JSON.parse(seen[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(ev).sort(), ["customerId", "messageId", "status", "type"]);
    assert.equal(ev.type, "message_status");
    const blob = seen[0].toLowerCase();
    for (const bad of ["accesstoken", "appsecret", "auth_secret", "wa_session", "password"]) {
      assert.ok(!blob.includes(bad), `bocor: ${bad}`);
    }
  });

  await check("applyStatusUpdate update bubble, unknown diabaikan", async () => {
    const { applyStatusUpdate: apply } = await import("../src/lib/wa-feed");
    const base = [
      { id: "1", messageId: "wamid.X", status: "SENT" },
      { id: "2", messageId: "wamid.Y", status: "SENT" },
    ] as never[];
    const next = apply(base, { messageId: "wamid.X", status: "READ" });
    assert.equal(next.find((m: { id: string }) => m.id === "1")!.status, "READ");
    assert.equal(next.find((m: { id: string }) => m.id === "2")!.status, "SENT");
    assert.equal(apply(base, { messageId: "wamid.Z", status: "READ" }), base);
    assert.equal(apply(base, { messageId: "wamid.X", status: "SENT" }).length, 2);
  });

  await check("GET messages memuat status; tanpa secret", async () => {
    const res = await getMessages(
      new NextRequest(
        `http://test/api/wa/messages?customerId=${customer.id}&direction=all`,
        { headers: { cookie: admin } },
      ),
    );
    const body = await res.text();
    const json = JSON.parse(body);
    const st1 = json.data.find((m: { messageId: string }) => m.messageId === "wamid.ST1");
    assert.equal(st1.status, "READ");
    for (const bad of ["passwordhash", "accesstoken", "appsecret", "auth_secret"]) {
      assert.ok(!body.toLowerCase().includes(bad), `bocor: ${bad}`);
    }
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
