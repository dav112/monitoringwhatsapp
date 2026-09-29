/**
 * Validasi environment server-side.
 * - Tidak pernah mengembalikan/mencetak NILAI secret (hanya configured/missing/weak).
 * - Dipakai /api/health dan scripts/wa-check.ts.
 */

const WEAK_VALUES = new Set([
  "development",
  "secret",
  "password",
  "password123",
  "changeme",
  "test",
  "123456",
  "00000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffff",
]);

export type EnvStatus = "configured" | "missing" | "weak" | "invalid";

export interface EnvReport {
  DATABASE_URL: EnvStatus;
  AUTH_SECRET: EnvStatus;
  WHATSAPP_CONFIG_ENCRYPTION_KEY: EnvStatus;
  WHATSAPP_ACCESS_TOKEN: EnvStatus;
  WHATSAPP_PHONE_NUMBER_ID: EnvStatus;
  WHATSAPP_VERIFY_TOKEN: EnvStatus;
  WHATSAPP_APP_SECRET: EnvStatus;
}

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function isWeakSecret(value: string): boolean {
  return WEAK_VALUES.has(value.trim().toLowerCase());
}

function isValidEncryptionKey(value: string): boolean {
  const v = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return true;
  try {
    return Buffer.from(v, "base64").length === 32;
  } catch {
    return false;
  }
}

function secretStatus(name: string, minLen: number): EnvStatus {
  const v = process.env[name] ?? "";
  if (!v.trim()) return "missing";
  if (v.trim().length < minLen || isWeakSecret(v)) return "weak";
  return "configured";
}

/** Status aman (tanpa nilai) untuk seluruh env penting. */
export function getEnvReport(): EnvReport {
  const encKey = process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY ?? "";
  return {
    DATABASE_URL: present("DATABASE_URL") ? "configured" : "missing",
    AUTH_SECRET: secretStatus("AUTH_SECRET", 32),
    WHATSAPP_CONFIG_ENCRYPTION_KEY:
      !encKey.trim() ? "missing" : !isValidEncryptionKey(encKey) ? "invalid" : "configured",
    WHATSAPP_ACCESS_TOKEN: secretStatus("WHATSAPP_ACCESS_TOKEN", 10),
    WHATSAPP_PHONE_NUMBER_ID: present("WHATSAPP_PHONE_NUMBER_ID") ? "configured" : "missing",
    WHATSAPP_VERIFY_TOKEN: secretStatus("WHATSAPP_VERIFY_TOKEN", 4),
    WHATSAPP_APP_SECRET: secretStatus("WHATSAPP_APP_SECRET", 8),
  };
}

/** Production wajib: 3 secret kritis harus "configured" (bukan missing/weak/invalid). */
export function productionEnvReady(): { ready: boolean; problems: string[] } {
  const r = getEnvReport();
  const problems: string[] = [];
  if (r.DATABASE_URL !== "configured") problems.push("DATABASE_URL");
  if (r.AUTH_SECRET !== "configured") problems.push("AUTH_SECRET");
  if (r.WHATSAPP_CONFIG_ENCRYPTION_KEY !== "configured") {
    problems.push("WHATSAPP_CONFIG_ENCRYPTION_KEY");
  }
  return { ready: problems.length === 0, problems };
}
