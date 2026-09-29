"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import {
  applyStatusUpdate,
  encodeCursor,
  mergeFeedMessages,
  messagePreview,
  statusLabel,
  timeAgo,
  type FeedMessage,
} from "@/lib/wa-feed";

type ConnState = "connecting" | "live" | "reconnecting" | "offline";

const PAGE_SIZE = 30;

export default function LiveMessageFeed() {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<FeedMessage[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [error, setError] = useState("");
  const [, setTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const messagesRef = useRef<FeedMessage[]>([]);
  // Sinkron ref di effect (bukan saat render) untuk dipakai callback SSE/catch-up.
  useEffect(() => {
    messagesRef.current = messages;
  });

  const newestCursor = useCallback(() => {
    const first = messagesRef.current[0];
    return first ? encodeCursor(first.createdAt, first.id) : null;
  }, []);

  const fetchAfter = useCallback(async (after: string | null) => {
    const q = new URLSearchParams({ limit: "50" });
    if (after) q.set("after", after);
    const res = await fetch(`/api/wa/messages?${q}`);
    if (!res.ok) throw new Error("Gagal mengambil pesan baru.");
    const json = await res.json();
    return (json.data ?? []) as FeedMessage[];
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wa/messages?limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error("Gagal memuat pesan.");
        const json = await res.json();
        if (cancelled) return;
        setMessages(json.data ?? []);
        setHasMore(Boolean(json.pageInfo?.hasMore));
        setBeforeCursor(json.pageInfo?.before ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat pesan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh label waktu tiap menit.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // SSE + visibility: tutup saat tab hidden, catch-up saat kembali.
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const open = () => {
      if (closed) return;
      setConn((c) => (c === "live" ? c : "connecting"));
      es = new EventSource("/api/wa/messages/stream");
      es.addEventListener("connected", () => {
        if (!closed) setConn("live");
      });
      es.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse((ev as MessageEvent).data) as FeedMessage;
          if (nearBottomRef.current) {
            setMessages((prev) => mergeFeedMessages(prev, [msg]));
          } else {
            setPending((prev) => mergeFeedMessages(prev, [msg]));
          }
        } catch {
          // payload rusak diabaikan
        }
      });
      es.addEventListener("message_status", (ev) => {
        try {
          const update = JSON.parse((ev as MessageEvent).data) as {
            messageId: string;
            status: string;
          };
          setMessages((prev) => applyStatusUpdate(prev, update));
          setPending((prev) => applyStatusUpdate(prev, update));
        } catch {
          // payload rusak diabaikan
        }
      });
      es.onerror = () => {
        if (!closed) setConn("reconnecting"); // EventSource retry otomatis + catch-up di bawah
      };
    };

    const catchUp = async () => {
      try {
        const fresh = await fetchAfter(newestCursor());
        if (fresh.length > 0) {
          if (nearBottomRef.current) {
            setMessages((prev) => mergeFeedMessages(prev, fresh));
          } else {
            setPending((prev) => mergeFeedMessages(prev, fresh));
          }
        }
      } catch {
        // diabaikan — retry berikutnya
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        es?.close();
        es = null;
        if (!closed) setConn("offline");
      } else {
        open();
        catchUp().catch(() => {});
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      es?.close();
    };
  }, [fetchAfter, newestCursor]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottomRef.current && pending.length > 0) {
      setMessages((prev) => mergeFeedMessages(prev, pending));
      setPending([]);
    }
  };

  const showPending = () => {
    setMessages((prev) => mergeFeedMessages(prev, pending));
    setPending([]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  const loadOlder = async () => {
    if (!beforeCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/wa/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(beforeCursor)}`);
      if (!res.ok) throw new Error("Gagal memuat pesan lama.");
      const json = await res.json();
      setMessages((prev) => mergeFeedMessages(prev, json.data ?? []));
      setHasMore(Boolean(json.pageInfo?.hasMore));
      setBeforeCursor(json.pageInfo?.before ?? null);
    } catch {
      // diabaikan, tombol tetap tersedia
    } finally {
      setLoadingOlder(false);
    }
  };

  const connLabel: Record<ConnState, { dot: string; text: string }> = {
    connecting: { dot: "bg-amber-400", text: "Menghubungkan..." },
    live: { dot: "bg-emerald-500", text: "Live" },
    reconnecting: { dot: "bg-amber-400", text: "Menghubungkan ulang..." },
    offline: { dot: "bg-gray-300", text: "Jeda (tab tidak aktif)" },
  };

  return (
    <section className="card-hover flex max-h-[560px] min-h-[320px] flex-col rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Pesan Masuk Terbaru</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mist dark:bg-night-700 px-2.5 py-1 text-xs font-medium text-brand-900 dark:text-night-100">
          <span className={`h-2 w-2 rounded-full ${connLabel[conn].dot}`} />
          {connLabel[conn].text}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : messages.length === 0 && pending.length === 0 ? (
        <p className="rounded-xl bg-cream dark:bg-night-700 p-3 text-sm text-gray-500 dark:text-night-400">Belum ada pesan masuk.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <button
              onClick={showPending}
              className="btn-transition mb-2 rounded-xl bg-brand-100 dark:bg-night-700 px-4 py-2 text-center text-xs font-semibold text-brand-800 dark:text-night-100 hover:bg-brand-200 dark:hover:bg-night-600"
            >
              {pending.length} pesan baru — tampilkan
            </button>
          )}
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.map((m, idx) => {
              const prev = messages[idx - 1];
              const sameCustomer = prev && prev.customerId && prev.customerId === m.customerId;
              return (
                <article key={m.id} className="rounded-xl bg-cream dark:bg-night-700 p-3">
                  {!sameCustomer && (
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-brand-900 dark:text-night-100">
                        {m.customer?.name ?? m.customer?.phone ?? "Pesan masuk"}
                      </p>
                      {m.customer && <StatusBadge status={m.customer.status} />}
                    </div>
                  )}
                  {!sameCustomer && (
                    <p className="text-xs text-gray-500 dark:text-night-400">
                      {[m.customer?.phone, m.customer?.city].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-800 dark:text-night-100">{messagePreview(m)}</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-night-400">
                    [{m.messageType}] • {timeAgo(m.createdAt)}
                    {m.direction === "OUTBOUND" && statusLabel(m.status) && (
                      <span role="status" aria-label={`Status pesan: ${statusLabel(m.status)}`}>
                        {" "}• {statusLabel(m.status)}
                      </span>
                    )}
                  </p>
                </article>
              );
            })}
            {hasMore && (
              <button
                onClick={loadOlder}
                disabled={loadingOlder}
                className="btn-transition w-full rounded-xl bg-mist dark:bg-night-700 px-4 py-2 text-xs font-semibold text-brand-900 dark:text-night-100 hover:bg-stone-soft disabled:opacity-50"
              >
                {loadingOlder ? "Memuat..." : "Muat pesan lebih lama"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
