import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { waConfig as waEnvConfig } from "./client";

export interface EffectiveWaConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  appSecret: string;
  /** Dari mana nilai dominan berasal: database bila ada baris config, else env. */
  source: "database" | "env";
}

export interface ConfigStatus {
  configured: boolean;
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountIdConfigured: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  source: "database" | "env" | "none";
}

function decryptOrEmpty(enc: string | null): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch (e) {
    console.error("[WhatsApp] Gagal mendekripsi konfigurasi (key berubah?):", (e as Error).message);
    return "";
  }
}

/** Ambil config efektif: database (terdekripsi) diprioritaskan, env sebagai fallback. */
export async function getEffectiveConfig(): Promise<EffectiveWaConfig> {
  const env = waEnvConfig();
  const row = await prisma.whatsappConfig.findUnique({ where: { id: "global" } });
  if (!row) {
    return { ...env, source: "env" };
  }
  return {
    accessToken: decryptOrEmpty(row.accessTokenEncrypted) || env.accessToken,
    phoneNumberId: row.phoneNumberId || env.phoneNumberId,
    businessAccountId: row.businessAccountId || env.businessAccountId,
    verifyToken: decryptOrEmpty(row.verifyTokenEncrypted) || env.verifyToken,
    appSecret: decryptOrEmpty(row.appSecretEncrypted) || env.appSecret,
    source: "database",
  };
}

/** Status aman untuk frontend — TANPA nilai secret. */
export async function getConfigStatus(): Promise<ConfigStatus> {
  const c = await getEffectiveConfig();
  const s: ConfigStatus = {
    configured: Boolean(c.accessToken && c.phoneNumberId && c.verifyToken),
    accessTokenConfigured: Boolean(c.accessToken),
    phoneNumberIdConfigured: Boolean(c.phoneNumberId),
    businessAccountIdConfigured: Boolean(c.businessAccountId),
    verifyTokenConfigured: Boolean(c.verifyToken),
    appSecretConfigured: Boolean(c.appSecret),
    source: "none",
  };
  if (s.accessTokenConfigured || s.phoneNumberIdConfigured || s.verifyTokenConfigured || s.appSecretConfigured) {
    s.source = c.source;
  }
  return s;
}

export type ClearableSecret = "accessToken" | "verifyToken" | "appSecret";
export type ClearableId = "phoneNumberId" | "businessAccountId";

export interface SaveConfigInput {
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  verifyToken?: string;
  appSecret?: string;
  /** Hapus eksplisit — satu-satunya cara menghapus via update. */
  clear?: (ClearableSecret | ClearableId)[];
}

function fail(msg: string): never {
  throw new Error(msg);
}

const NUMERIC = /^[0-9]{5,25}$/;

/**
 * Simpan/update konfigurasi. Aturan:
 * - Secret kosong/undefined → PERTAHANKAN nilai lama (kecuali disebut di `clear`).
 * - ID kosong/undefined → pertahankan; disebut di `clear` → hapus (null).
 * - Secret dienkripsi sebelum simpan. Tidak pernah log plaintext.
 */
export async function saveConfig(input: SaveConfigInput): Promise<ConfigStatus> {
  const clear = new Set(input.clear ?? []);
  const needsCrypto =
    (input.accessToken !== undefined && input.accessToken !== "") ||
    (input.verifyToken !== undefined && input.verifyToken !== "") ||
    (input.appSecret !== undefined && input.appSecret !== "") ||
    clear.has("accessToken") ||
    clear.has("verifyToken") ||
    clear.has("appSecret");

  if (needsCrypto && !process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY?.trim()) {
    fail("WHATSAPP_CONFIG_ENCRYPTION_KEY belum dikonfigurasi.");
  }

  const data: {
    accessTokenEncrypted?: string | null;
    phoneNumberId?: string | null;
    businessAccountId?: string | null;
    verifyTokenEncrypted?: string | null;
    appSecretEncrypted?: string | null;
  } = {};

  const takeSecret = (field: ClearableSecret, value: string | undefined, min: number, label: string) => {
    if (clear.has(field)) {
      if (field === "accessToken") data.accessTokenEncrypted = null;
      if (field === "verifyToken") data.verifyTokenEncrypted = null;
      if (field === "appSecret") data.appSecretEncrypted = null;
      return;
    }
    if (value === undefined || value === "") return; // pertahankan lama
    const v = value.trim();
    if (v.length < min) fail(`${label} minimal ${min} karakter.`);
    const enc = encryptSecret(v);
    if (field === "accessToken") data.accessTokenEncrypted = enc;
    if (field === "verifyToken") data.verifyTokenEncrypted = enc;
    if (field === "appSecret") data.appSecretEncrypted = enc;
  };

  const takeId = (field: ClearableId, value: string | undefined, label: string) => {
    if (clear.has(field)) {
      data[field] = null;
      return;
    }
    if (value === undefined || value === "") return; // pertahankan lama
    const v = value.trim();
    if (!NUMERIC.test(v)) fail(`${label} harus berupa angka (ID Meta).`);
    data[field] = v;
  };

  takeSecret("accessToken", input.accessToken, 10, "Access Token");
  takeSecret("verifyToken", input.verifyToken, 4, "Verify Token");
  takeSecret("appSecret", input.appSecret, 8, "App Secret");
  takeId("phoneNumberId", input.phoneNumberId, "Phone Number ID");
  takeId("businessAccountId", input.businessAccountId, "Business Account ID");

  // Semua kosong = tidak ada perubahan → sukses no-op, nilai lama dipertahankan.
  if (Object.keys(data).length === 0) return getConfigStatus();

  await prisma.whatsappConfig.upsert({
    where: { id: "global" },
    update: data,
    create: { id: "global", ...data },
  });
  console.log("[WhatsApp] Konfigurasi diperbarui.");
  return getConfigStatus();
}
