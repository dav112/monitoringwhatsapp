"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import MessageComposer from "@/components/MessageComposer";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import {
  applyStatusUpdate,
  encodeCursor,
  filterByCustomer,
  formatChatTime,
  mergeFeedMessages,
  messagePreview,
  statusLabel,
  type FeedMessage,
} from "@/lib/wa-feed";
import { formatDate, type CustomerStatus } from "@/lib/types";

interface WorkspaceCustomer {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

interface Interaction {
  id: string;
  type: "MESSAGE" | "CITY_DETECTED" | "STATUS_CHANGED" | "NOTE";
  content: string;
  createdAt: string;
}

const PAGE_SIZE = 30;
type ConnState = "connecting" | "live" | "reconnecting" | "offline";

const INTERACTION_LABEL: Record<Interaction["type"], string> = {
  MESSAGE: "Incoming message",
  CITY_DETECTED: "City detected",
  STATUS_CHANGED: "Status changed",
  NOTE: "Note",
};

export default function CustomerWorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { push } = useToast();

  const [customer, setCustomer] = useState<WorkspaceCustomer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [customerError, setCustomerError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conn, setConn] = useState<ConnState>("connecting");

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const messagesRef = useRef<FeedMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  });

  const newestCursor = useCallback(() => {
    const first = messagesRef.current[0];
    return first ? encodeCursor(first.createdAt, first.id) : null;
  }, []);

  // --- customer + interactions ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/customers/${id}`);
        const json = await res.json().catch(() => ({}));
        if (res.status === 404) throw new Error("Customer tidak ditemukan.");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Gagal memuat customer.");
        if (cancelled) return;
        setCustomer(json.data.customer);
        setInteractions(json.data.interactions ?? []);
      } catch (e) {
        if (!cancelled) setCustomerError(e instanceof Error ? e.message : "Gagal memuat customer.");
      } finally {
        if (!cancelled) setLoadingCustomer(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // --- conversation (desc dari API, ditampilkan asc) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/wa/messages?customerId=${encodeURIComponent(id)}&direction=all&limit=${PAGE_SIZE}`,
        );
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Riwayat pesan gagal dimuat.");
        if (cancelled) return;
        setMessages(json.data ?? []);
        setHasMore(Boolean(json.pageInfo?.hasMore));
        setBeforeCursor(json.pageInfo?.before ?? null);
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch (e) {
        if (!cancelled) setMessagesError(e instanceof Error ? e.message : "Riwayat pesan gagal dimuat.");
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const appendLive = useCallback(
    (incoming: FeedMessage[]) => {
      const mine = filterByCustomer(incoming, id);
      if (mine.length === 0) return; // event customer lain diabaikan
      if (nearBottomRef.current) {
        setMessages((prev) => mergeFeedMessages(prev, mine));
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight });
        });
      } else {
        setMessages((prev) => {
          const next = mergeFeedMessages(prev, mine);
          setPendingCount(next.length - prev.length);
          return next;
        });
      }
    },
    [id],
  );

  // Pesan terkirim (POST sukses) langsung merge; SSE echo ter-dedupe by id.
  const handleSent = useCallback(
    (m: FeedMessage) => {
      const mine = filterByCustomer([m], id);
      if (mine.length > 0) {
        setMessages((prev) => mergeFeedMessages(prev, mine));
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight });
        });
      }
    },
    [id],
  );

  // --- SSE existing + visibility + catch-up ---
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const catchUp = async () => {
      try {
        const after = newestCursor();
        const q = new URLSearchParams({ customerId: id, direction: "all", limit: "50" });
        if (after) q.set("after", after);
        const res = await fetch(`/api/wa/messages?${q}`);
        if (!res.ok) return;
        const json = await res.json();
        appendLive(json.data ?? []);
        // Refresh profil bila city/status berubah selagi dibuka.
        const c = await fetch(`/api/customers/${id}`);
        if (c.ok) {
          const cj = await c.json();
          setCustomer(cj.data.customer);
          setInteractions(cj.data.interactions ?? []);
        }
      } catch {
        // diabaikan — retry berikutnya
      }
    };

    const open = () => {
      if (closed) return;
      setConn("connecting");
      es = new EventSource("/api/wa/messages/stream");
      es.addEventListener("connected", () => {
        if (!closed) setConn("live");
      });
      es.addEventListener("message", (ev) => {
        try {
          appendLive([JSON.parse((ev as MessageEvent).data) as FeedMessage]);
        } catch {
          // payload rusak diabaikan
        }
      });
      es.addEventListener("message_status", (ev) => {
        try {
          const update = JSON.parse((ev as MessageEvent).data) as {
            messageId: string;
            customerId: string;
            status: string;
          };
          if (update.customerId !== id) return;
          setMessages((prev) => applyStatusUpdate(prev, update));
        } catch {
          // payload rusak diabaikan
        }
      });
      es.onerror = () => {
        if (!closed) setConn("reconnecting");
      };
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
  }, [id, appendLive, newestCursor]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottomRef.current) setPendingCount(0);
  };

  const loadOlder = async () => {
    if (!beforeCursor || loadingOlder) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/wa/messages?customerId=${encodeURIComponent(id)}&direction=all&limit=${PAGE_SIZE}&before=${encodeURIComponent(beforeCursor)}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat pesan lama.");
      setMessages((prev) => mergeFeedMessages(prev, json.data ?? []));
      setHasMore(Boolean(json.pageInfo?.hasMore));
      setBeforeCursor(json.pageInfo?.before ?? null);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal memuat pesan lama.", "error");
    } finally {
      setLoadingOlder(false);
    }
  };

  const asc = [...messages].reverse();
  const connText = { connecting: "Menghubungkan...", live: "Live", reconnecting: "Menghubungkan ulang...", offline: "Jeda" }[conn];
  const connDot = conn === "live" ? "bg-emerald-500" : conn === "offline" ? "bg-gray-300" : "bg-amber-400";

  return (
    <>
      <Header title={customer ? `Customers / ${customer.name}` : "Customer Workspace"} subtitle="Profil, conversation & aktivitas (read-only)" />
      <main className="space-y-4 p-4 sm:p-6">
        <Link href="/customers" className="btn-transition inline-block text-sm font-semibold text-brand-700 dark:text-brand-300 hover:underline">
          ← Back to Customers
        </Link>

        {loadingCustomer ? (
          <LoadingSkeleton rows={4} />
        ) : customerError || !customer ? (
          <div className="rounded-2xl border border-red-200 bg-white dark:bg-night-800 p-6 text-center">
            <p className="text-sm font-medium text-red-600">{customerError || "Customer tidak ditemukan."}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Kolom kiri: profil + aktivitas */}
            <div className="space-y-4">
              <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-200 text-base font-bold text-brand-900" aria-hidden="true">
                    {customer.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-brand-900 dark:text-night-100">{customer.name}</h2>
                    <p className="break-all text-xs text-gray-500 dark:text-night-400">{customer.phone}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">Status</dt>
                    <dd><StatusBadge status={customer.status} /></dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">City</dt>
                    <dd className="font-medium">{customer.city ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">Created</dt>
                    <dd className="text-right font-medium">{formatDate(customer.createdAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">Updated</dt>
                    <dd className="text-right font-medium">{formatDate(customer.updatedAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
                <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Activity</h2>
                {interactions.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500 dark:text-night-400">Belum ada aktivitas.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {[...interactions]
                      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                      .map((it) => (
                        <li key={it.id} className="border-l-2 border-brand-200 pl-3">
                          <p className="text-xs font-semibold text-brand-900 dark:text-night-100">{INTERACTION_LABEL[it.type]}</p>
                          {it.content && (
                            <p className="mt-0.5 break-words text-xs text-gray-600 dark:text-night-400">{it.content}</p>
                          )}
                          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-night-400">{formatChatTime(it.createdAt)}</p>
                        </li>
                      ))}
                  </ol>
                )}
              </section>
            </div>

            {/* Kolom kanan: conversation */}
            <section className="card-hover flex max-h-[640px] min-h-[380px] flex-col rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Conversation</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mist dark:bg-night-700 px-2.5 py-1 text-xs font-medium text-brand-900 dark:text-night-100">
                  <span className={`h-2 w-2 rounded-full ${connDot}`} />
                  {connText}
                </span>
              </div>

              {loadingMessages ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : messagesError ? (
                <>
                  <div className="rounded-xl bg-red-50 p-3 text-center">
                    <p className="text-sm text-red-700">{messagesError}</p>
                    <button onClick={() => window.location.reload()} className="btn-transition mt-2 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
                      Coba lagi
                    </button>
                  </div>
                  <MessageComposer customerId={id} onSent={handleSent} />
                </>
              ) : asc.length === 0 ? (
                <>
                  <p className="rounded-xl bg-cream dark:bg-night-700 p-3 text-sm text-gray-500 dark:text-night-400">Belum ada pesan.</p>
                  <MessageComposer customerId={id} onSent={handleSent} />
                </>
              ) : (
                <>
                  {pendingCount > 0 && (
                    <button
                      onClick={() => {
                        setPendingCount(0);
                        requestAnimationFrame(() => {
                          const el = scrollRef.current;
                          if (el) el.scrollTo({ top: el.scrollHeight });
                        });
                      }}
                      className="btn-transition mb-2 rounded-xl bg-brand-100 dark:bg-night-700 px-4 py-2 text-center text-xs font-semibold text-brand-800 dark:text-night-100 hover:bg-brand-200 dark:hover:bg-night-600"
                    >
                      {pendingCount} pesan baru — tampilkan
                    </button>
                  )}
                  <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-2 overflow-y-auto pr-1" role="log" aria-label="Riwayat percakapan" aria-live="off">
                    {hasMore && (
                      <button
                        onClick={loadOlder}
                        disabled={loadingOlder}
                        className="btn-transition w-full rounded-xl bg-mist dark:bg-night-700 px-4 py-2 text-xs font-semibold text-brand-900 dark:text-night-100 hover:bg-stone-soft disabled:opacity-50"
                      >
                        {loadingOlder ? "Memuat..." : "Load older messages"}
                      </button>
                    )}
                    {asc.map((m) => {
                      const outbound = m.direction === "OUTBOUND";
                      return (
                        <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`msg-in max-w-[85%] overflow-hidden rounded-2xl px-3 py-2 sm:max-w-[75%] ${
                              outbound
                                ? "rounded-br-md bg-brand-100 dark:bg-night-700 text-brand-900 dark:text-night-100"
                                : "rounded-bl-md bg-cream dark:bg-night-700 text-gray-800 dark:text-night-100"
                            }`}
                          >
                            <p className="text-[11px] font-semibold opacity-70">
                              {outbound ? "CS" : customer.name} • {m.messageType}
                            </p>
                            <p className="mt-0.5 break-words text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {messagePreview(m)}
                            </p>
                            <p className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-60">
                              <span>{formatChatTime(m.createdAt)}</span>
                              {outbound && statusLabel(m.status) && (
                                <span
                                  role="status"
                                  aria-label={`Status pesan: ${statusLabel(m.status)}`}
                                  title={m.statusDetail ?? undefined}
                                  className={m.status === "FAILED" ? "font-semibold text-red-600" : undefined}
                                >
                                  • {statusLabel(m.status)}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <MessageComposer customerId={id} onSent={handleSent} />
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
