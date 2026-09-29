/**
 * Client ringan untuk health check WhatsApp Cloud API (Graph API).
 * Hanya dipakai server-side — token TIDAK PERNAH dikirim ke frontend.
 */

const GRAPH_VERSION = "v21.0";

export interface HealthResult {
  reachable: boolean;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

// Cache singkat per kredensial (key = hash, token tidak disimpan) agar status
// API tidak menghantam Graph API terus-menerus.
import crypto from "node:crypto";
const cache = new Map<string, { at: number; result: HealthResult }>();
const CACHE_TTL_MS = 60_000;

function cacheKey(accessToken: string, phoneNumberId: string): string {
  return crypto.createHash("sha256").update(`${accessToken}:${phoneNumberId}`).digest("hex");
}

export function waConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
  };
}

export function isConfigured(): boolean {
  const c = waConfig();
  return Boolean(c.accessToken && c.phoneNumberId && c.verifyToken);
}

export async function checkApiHealth(
  force = false,
  creds?: { accessToken: string; phoneNumberId: string },
): Promise<HealthResult> {
  const accessToken = creds?.accessToken ?? waConfig().accessToken;
  const phoneNumberId = creds?.phoneNumberId ?? waConfig().phoneNumberId;
  if (!accessToken || !phoneNumberId) {
    return { reachable: false, displayPhoneNumber: null, verifiedName: null };
  }
  // Cache hanya bila bukan force; Test Connection pakai force=true agar selalu fresh.
  const key = cacheKey(accessToken, phoneNumberId);
  const hit = !force ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const result: HealthResult = { reachable: false, displayPhoneNumber: null, verifiedName: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as { display_phone_number?: string; verified_name?: string };
      result.reachable = true;
      result.displayPhoneNumber = json.display_phone_number ?? null;
      result.verifiedName = json.verified_name ?? null;
    }
  } catch {
    result.reachable = false;
  }
  cache.set(key, { at: Date.now(), result });
  return result;
}
