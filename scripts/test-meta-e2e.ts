/**
 * Meta E2E (official Cloud API saja). Tanpa kredensial → SKIPPED jujur.
 * Real send HANYA bila META_E2E_ENABLE_SEND=true + META_E2E_TEST_RECIPIENT terisi.
 * USE: npm run test:meta-e2e
 * AMAN: tidak mencetak token/secret/nomor penuh.
 */
import "dotenv/config";

function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length < 6) return "***";
  return `${d.slice(0, 4)}***${d.slice(-2)}`;
}

function row(name: string, result: "PASS" | "FAIL" | "SKIPPED" | "NOT TESTED", note = "") {
  console.log(`${name.padEnd(24)} ${result}${note ? ` — ${note}` : ""}`);
}

async function main() {
  const { getEffectiveConfig } = await import("../src/lib/whatsapp/config");
  const { checkApiHealth } = await import("../src/lib/whatsapp/client");
  const { sendTextMessage } = await import("../src/lib/whatsapp/outbound");
  const { prisma } = await import("../src/lib/prisma");

  const creds = await getEffectiveConfig().catch(() => null);
  const hasCreds = Boolean(creds?.accessToken && creds?.phoneNumberId);

  console.log("META E2E\n");
  if (!hasCreds) {
    row("Meta connection", "SKIPPED");
    row("Webhook verification", "SKIPPED");
    row("WABA subscription", "SKIPPED");
    row("Real inbound", "SKIPPED");
    row("Real outbound", "SKIPPED");
    row("Delivery status", "SKIPPED");
    console.log("\nMETA E2E SKIPPED");
    console.log("Reason: real Meta credentials/setup unavailable.");
    await prisma.$disconnect();
    return;
  }

  // 1. connection
  const health = await checkApiHealth(true, {
    accessToken: creds!.accessToken,
    phoneNumberId: creds!.phoneNumberId,
  });
  row("Meta connection", health.reachable ? "PASS" : "FAIL");

  // 2. webhook readiness (konfigurasi, bukan event nyata)
  const ready =
    Boolean(creds!.verifyToken) && Boolean(creds!.appSecret) && health.reachable;
  row("Webhook readiness", ready ? "PASS" : "FAIL", "verify-token + app-secret + reachable");

  // 3. real send (opt-in ganda)
  const sendEnabled =
    process.env.META_E2E_ENABLE_SEND === "true" &&
    Boolean(process.env.META_E2E_TEST_RECIPIENT?.trim());
  if (!sendEnabled) {
    row("Real outbound", "SKIPPED", "META_E2E_ENABLE_SEND != true / recipient kosong");
    row("Delivery status", "SKIPPED");
    console.log("\nMETA E2E SKIPPED (parsial: hanya connection/readiness)");
    await prisma.$disconnect();
    return;
  }

  const to = process.env.META_E2E_TEST_RECIPIENT!.trim();
  console.log(`recipient: ${maskPhone(to)}`);
  try {
    const { metaMessageId } = await sendTextMessage(
      { accessToken: creds!.accessToken, phoneNumberId: creds!.phoneNumberId },
      to,
      "Pesan tes otomatis dashboard (abaikan).",
    );
    row("Real outbound", "PASS", `meta id tersimpan, tanpa spam`);
    // Observasi status hingga 90 detik (butuh webhook publik + subscription aktif).
    const deadline = Date.now() + 90000;
    let observed = "SENT";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10000));
      const check = await prisma.whatsAppMessage
        .findUnique({ where: { messageId: metaMessageId }, select: { status: true } })
        .catch(() => null);
      if (check?.status && check.status !== "SENT") {
        observed = check.status;
        if (observed === "READ" || observed === "FAILED") break;
      }
    }
    row("Delivery status", observed === "SENT" ? "NOT TESTED" : "PASS", `observed=${observed} (90s window)`);
  } catch (e) {
    row("Real outbound", "FAIL", e instanceof Error ? e.message : "error");
    row("Delivery status", "NOT TESTED");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
