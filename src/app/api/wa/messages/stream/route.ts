import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { onFeedMessage, onStatusEvent } from "@/lib/wa-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/messages/stream — SSE pesan baru (semua role terautentikasi).
 * Cookie session terkirim otomatis oleh EventSource (same-origin).
 * Tanpa DB polling per koneksi: broadcast dari bus in-memory yang diisi webhook.
 * Heartbeat 25 dtk; cleanup saat browser disconnect (AbortSignal).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // controller sudah ditutup — cleanup via cancel()
        }
      };
      send("connected", JSON.stringify({ ok: true }));
      const offs = [
        onFeedMessage((msg) => {
          send("message", JSON.stringify(msg));
        }),
        onStatusEvent((ev) => {
          send("message_status", JSON.stringify(ev));
        }),
      ];
      unsubscribe = () => {
        offs.forEach((off) => off());
      };
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // diabaikan, cancel() membersihkan
        }
      }, 25000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  // Batalkan stream bila koneksi browser terputus.
  req.signal.addEventListener("abort", () => {
    if (heartbeat) clearInterval(heartbeat);
    if (unsubscribe) unsubscribe();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
