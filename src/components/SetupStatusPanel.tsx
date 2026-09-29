"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Panel status koneksi live di Tutorial: URL webhook (copy), generate verify
 * token (copy saja, TIDAK auto-save), dan status dari /api/wa/status.
 * Polling ringan 15 detik; berhenti saat tab hidden.
 */
export default function SetupStatusPanel() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [genToken, setGenToken] = useState("");
  const [status, setStatus] = useState<{
    configured: boolean;
    webhookConfigured: boolean;
    apiReachable: boolean | null;
  } | null>(null);

  useEffect(() => {
    // URL origin hanya ada di browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${window.location.origin}/api/wa/webhook`);
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/wa/status");
        if (!res.ok) return;
        const json = await res.json();
        if (!stop) {
          setStatus({
            configured: !!json.data?.configured,
            webhookConfigured: !!json.data?.webhookConfigured,
            apiReachable: json.data?.apiReachable ?? null,
          });
        }
      } catch {
        // abaikan, coba lagi interval berikut
      }
    };
    load();
    const t = setInterval(() => {
      if (!document.hidden) load().catch(() => {});
    }, 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const copy = async (text: string, which: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  const generate = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token =
      "verify_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    setGenToken(token);
  };

  const rows: { label: string; ok: boolean | null; hint: string }[] = [
    {
      label: "Kredensial terpasang",
      ok: status ? status.configured : null,
      hint: "Access Token + Phone Number ID + Verify Token",
    },
    {
      label: "Webhook siap",
      ok: status ? status.webhookConfigured : null,
      hint: "Verify Token terisi",
    },
    {
      label: "Meta terjangkau",
      ok: status?.apiReachable ?? null,
      hint: "Hasil Test Connection terakhir",
    },
  ];

  return (
    <section aria-label="Status koneksi saat ini" className="rounded-2xl border border-stone-soft bg-white p-5 dark:border-night-600 dark:bg-night-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Status koneksi lu sekarang</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-brand-900 dark:bg-night-700 dark:text-night-100">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-medium text-brand-900 dark:text-night-100">{r.label}</p>
              <p className="text-xs text-gray-500 dark:text-night-400">{r.hint}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                r.ok === null
                  ? "bg-mist text-gray-500 dark:bg-night-700 dark:text-night-400"
                  : r.ok
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {r.ok === null ? "..." : r.ok ? "OK ✓" : "Belum"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-night-400">URL webhook lu (copy ini ke Meta):</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-brand-900 px-3 py-2 text-xs text-brand-100">
            {url || "..."}
          </code>
          <button
            onClick={() => url && copy(url, "url")}
            className="btn-transition shrink-0 rounded-xl bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {copied === "url" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-night-400">
          Belum punya Verify Token? Generate, copy, terus paste di Meta + di Settings:
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-brand-900 px-3 py-2 text-xs text-brand-100">
            {genToken || "klik Generate dulu"}
          </code>
          <button
            onClick={generate}
            className="btn-transition shrink-0 rounded-xl bg-mist px-3 py-2 text-xs font-semibold text-brand-900 hover:bg-stone-soft focus-visible:outline-2 focus-visible:outline-brand-600 dark:bg-night-700 dark:text-night-100"
          >
            Generate
          </button>
          {genToken && (
            <button
              onClick={() => copy(genToken, "token")}
              className="btn-transition shrink-0 rounded-xl bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              {copied === "token" ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>

      <Link
        href="/settings"
        className="btn-transition mt-4 block rounded-xl bg-brand-100 px-4 py-2 text-center text-sm font-semibold text-brand-800 hover:bg-brand-200 dark:bg-night-700 dark:text-night-100"
      >
        Buka Settings → WhatsApp Configuration
      </Link>
    </section>
  );
}
