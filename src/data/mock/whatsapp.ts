/**
 * MOCK WhatsApp status — Step 1 only.
 * JANGAN menganggap ini koneksi asli.
 * Integrasi Baileys / WhatsApp API dilakukan di Step 2.
 */
export const MOCK_WHATSAPP = {
  isMock: true,
  connection: "disconnected" as "connected" | "disconnected",
  // Contoh tampilan saat connected — tetap mock
  previewConnected: {
    businessNumber: "+62 821-0000-1234",
    displayName: "Toko Maju (Business)",
    webhook: "active" as const,
    webhookUrl: "https://contoh.id/api/wa/webhook (mock)",
    lastMessage: {
      from: "Siti Aminah • 0812-3456-7890",
      text: "Kak, boleh tahu dari kota mana? — Bogor kak",
      at: "28 Sep 2026, 09:12 (mock)",
    },
    uptime: "— (mock, belum terhubung)",
  },
  disconnected: {
    businessNumber: "Belum terhubung (mock)",
    webhook: "inactive" as const,
    lastMessage: {
      from: "—",
      text: "Belum ada pesan. Hubungkan perangkat di Step 2.",
      at: "—",
    },
  },
} as const;
