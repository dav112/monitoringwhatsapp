/**
 * Uji unit fungsi WhatsApp Step 3 — TANPA butuh API Meta sungguhan.
 * USE: npm run test:wa
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { detectCity } from "../src/lib/customer/city-detector";
import { normalizePhone } from "../src/lib/customer/phone";
import { parseWebhookPayload, verifySignature } from "../src/lib/whatsapp/webhook";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`, e);
    process.exitCode = 1;
  }
}

// --- city detector (kasus wajib spec) ---
check('"Bogor" → Bogor', () => assert.equal(detectCity("Bogor"), "Bogor"));
check('"bogor kak" → Bogor', () => assert.equal(detectCity("bogor kak"), "Bogor"));
check('"Saya dari Bogor" → Bogor', () => assert.equal(detectCity("Saya dari Bogor"), "Bogor"));
check('"domisili saya di Jakarta" → Jakarta', () =>
  assert.equal(detectCity("domisili saya di Jakarta"), "Jakarta"));
check('"Depok kak" → Depok', () => assert.equal(detectCity("Depok kak"), "Depok"));
check('"halo kak" → null', () => assert.equal(detectCity("halo kak"), null));
check('"Bogor, Jawa Barat" → Bogor', () =>
  assert.equal(detectCity("Bogor, Jawa Barat"), "Bogor"));
check('"DKI Jakarta" → Jakarta', () => assert.equal(detectCity("DKI Jakarta"), "Jakarta"));
check('"nasi padang" → null (anti false-positive)', () =>
  assert.equal(detectCity("nasi padang"), null));
check('"kota padang kak" → Padang (dengan konteks)', () =>
  assert.equal(detectCity("kota padang kak"), "Padang"));
check("string kosong → null", () => assert.equal(detectCity(""), null));
check("non-string → null", () => assert.equal(detectCity(null), null));

// --- phone normalization ---
check('"+62 812-3456-7890" → 6281234567890', () =>
  assert.equal(normalizePhone("+62 812-3456-7890"), "6281234567890"));
check('"081234567890" → 628123456789', () =>
  assert.equal(normalizePhone("081234567890"), "628123456789"));
check('"628123456789" tetap', () => assert.equal(normalizePhone("628123456789"), "628123456789"));
check('"00628123456789" → 628123456789', () =>
  assert.equal(normalizePhone("00628123456789"), "628123456789"));
check('"abc" → null', () => assert.equal(normalizePhone("abc"), null));
check("non-string → null", () => assert.equal(normalizePhone(123), null));

// --- signature verification ---
check("signature valid lolos", () => {
  const secret = "test_secret";
  const raw = '{"object":"whatsapp_business_account"}';
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  assert.deepEqual(verifySignature(raw, sig, secret), { ok: true, skipped: false });
});
check("signature salah ditolak", () => {
  assert.deepEqual(verifySignature("{}", "sha256=00", "test_secret"), { ok: false, skipped: false });
});
check("tanpa secret → dilewati (dev)", () => {
  assert.deepEqual(verifySignature("{}", null, undefined), { ok: true, skipped: true });
});

// --- parse webhook payload ---
check("parse pesan teks Meta", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "628100000099", phone_number_id: "999" },
              contacts: [{ profile: { name: "Budi Mock" }, wa_id: "6281990001111" }],
              messages: [
                {
                  from: "6281990001111",
                  id: "wamid.TEST123",
                  timestamp: "1727000000",
                  type: "text",
                  text: { body: "Halo kak, saya dari Bogor" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const out = parseWebhookPayload(payload);
  assert.equal(out.length, 1);
  assert.equal(out[0].messageId, "wamid.TEST123");
  assert.equal(out[0].phone, "6281990001111");
  assert.equal(out[0].profileName, "Budi Mock");
  assert.equal(out[0].messageType, "text");
  assert.equal(out[0].content, "Halo kak, saya dari Bogor");
});
check("event statuses → diabaikan (kosong)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messaging_product: "whatsapp", statuses: [{ id: "x" }] } }] }],
  };
  assert.deepEqual(parseWebhookPayload(payload), []);
});
check("object lain → diabaikan", () => {
  assert.deepEqual(parseWebhookPayload({ object: "page", entry: [] }), []);
});

console.log(`\n${passed} test lolos.`);
