/**
 * Pengiriman text via WhatsApp Cloud API (Graph API). Server-side only.
 * Token tidak pernah ke frontend. Fetch dapat di-inject untuk testing.
 */

const GRAPH_VERSION = "v21.0";
export const OUTBOUND_MAX_LENGTH = 4096;
const SEND_TIMEOUT_MS = 10000;

export interface SendCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export interface SendResult {
  metaMessageId: string;
}

export class OutboundError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

type FetchImpl = typeof fetch;

function safeMetaMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const e = (payload as { error?: { message?: unknown; code?: unknown } }).error;
    const code = typeof e?.code === "number" ? e.code : 0;
    // 190/401/403 = kredensial; 131000-ish = nomor; 429 = rate limit Meta.
    if (code === 190 || code === 401 || code === 403) {
      return "Kredensial WhatsApp tidak valid. Periksa konfigurasi.";
    }
    if (code === 131026 || code === 131030) {
      return "Nomor tujuan tidak valid / tidak terdaftar di WhatsApp.";
    }
    if (code === 429 || code === 131048) {
      return "Batas pengiriman Meta tercapai. Coba lagi nanti.";
    }
    if (typeof e?.message === "string" && e.message.length > 0 && e.message.length < 200) {
      return `WhatsApp menolak pesan (${code}).`;
    }
  }
  return "WhatsApp menolak pesan. Coba lagi.";
}

/**
 * Kirim text message. Return Meta message ID bila accepted.
 * Throw OutboundError (aman untuk user) bila ditolak/gagal.
 */
export async function sendTextMessage(
  creds: SendCredentials,
  to: string,
  body: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SendResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(
      `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body, preview_url: false },
        }),
        signal: ctrl.signal,
      },
    );
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      // Ambiguous: Meta mungkin sudah menerima. Tandai non-retry-otomatis.
      throw new OutboundError("TIMEOUT", "Pengiriman belum dapat dikonfirmasi.", false);
    }
    throw new OutboundError("NETWORK", "Koneksi ke WhatsApp gagal. Coba lagi.", true);
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new OutboundError("META_REJECTED", safeMetaMessage(payload), retryable);
  }
  const id =
    typeof payload === "object" && payload !== null && "messages" in payload
      ? (payload as { messages?: { id?: unknown }[] }).messages?.[0]?.id
      : undefined;
  if (typeof id !== "string" || !id) {
    throw new OutboundError("META_BAD_RESPONSE", "Respons WhatsApp tidak valid.", false);
  }
  return { metaMessageId: id };
}
