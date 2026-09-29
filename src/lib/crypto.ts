import crypto from "node:crypto";

const PREFIX = "v1";

function getKey(): Buffer {
  const raw = (process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("WHATSAPP_CONFIG_ENCRYPTION_KEY belum dikonfigurasi.");
  }
  // Dukung 64-char hex (= 32 byte) atau base64 32 byte.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  throw new Error("WHATSAPP_CONFIG_ENCRYPTION_KEY tidak valid (butuh 32 byte hex/base64).");
}

/** Enkripsi AES-256-GCM. Format: v1:iv_b64:tag_b64:cipher_b64. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Dekripsi format encryptSecret. Throw bila format/key salah. */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Format secret terenkripsi tidak dikenal.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
}

export function isEncryptedValue(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(`${PREFIX}:`);
}
