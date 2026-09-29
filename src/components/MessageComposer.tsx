"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedMessage } from "@/lib/wa-feed";

type SendState = "idle" | "sending" | "failed";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Composer reply CS (text only). Selalu kirim dengan clientMessageId yang sama
 * selama satu submisi (termasuk retry) agar backend dedupe; key baru hanya
 * setelah sukses. Input dipertahankan bila gagal.
 */
export default function MessageComposer({
  customerId,
  onSent,
}: {
  customerId: string;
  onSent: (m: FeedMessage) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState("");
  const keyRef = useRef<string>(newKey());

  const canSend = text.trim().length > 0 && state !== "sending";

  const send = async () => {
    const content = text.trim();
    if (!content || state === "sending") {
      if (!content) setError("Pesan tidak boleh kosong.");
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch(`/api/customers/${customerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientMessageId: keyRef.current }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) throw new Error("Anda tidak memiliki akses untuk mengirim pesan.");
      if (res.status === 404) throw new Error("Customer tidak ditemukan.");
      if (res.status === 409) {
        // Ambiguous/in-flight: JANGAN resend otomatis, JANGAN hapus input.
        throw new Error(json.error ?? "Pengiriman belum dapat dikonfirmasi.");
      }
      if (res.status === 503) throw new Error("WhatsApp belum dikonfigurasi.");
      if (!res.ok) throw new Error(json.error ?? "Pesan gagal dikirim. Coba lagi.");
      onSent(json.data.message as FeedMessage);
      setText("");
      keyRef.current = newKey();
      setState("idle");
    } catch (e) {
      setState("failed");
      setError(
        e instanceof Error ? e.message : "Koneksi gagal. Coba lagi.",
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send().catch(() => {});
    }
  };

  return (
    <div className="mt-3 border-t border-mist dark:border-night-600 pt-3">
      {state === "failed" && error && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{error}</p>
          <button
            onClick={() => send().catch(() => {})}
            className="btn-transition shrink-0 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
          >
            Coba lagi
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Tulis pesan balasan
        </label>
        <textarea
          id="composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Tulis pesan..."
          className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
        />
        <button
          onClick={() => send().catch(() => {})}
          disabled={!canSend}
          aria-label="Kirim pesan"
          className="btn-transition shrink-0 rounded-xl bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {state === "sending" ? "Sending..." : "Send"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400 dark:text-night-400">Enter untuk kirim • Shift+Enter baris baru</p>
    </div>
  );
}
