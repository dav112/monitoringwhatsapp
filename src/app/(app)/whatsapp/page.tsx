"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import LiveMessageFeed from "@/components/LiveMessageFeed";
import type { WaStatusData } from "@/lib/types";

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-mist dark:border-night-600 pb-2 last:border-0 last:pb-0">
      <dt className="text-gray-500 dark:text-night-400">{label}</dt>
      <dd>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            ok ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600 dark:text-night-400"
          }`}
        >
          {ok ? "Terkonfigurasi" : "Belum dikonfigurasi"}
        </span>
      </dd>
    </div>
  );
}

export default function WhatsappPage() {
  const [data, setData] = useState<WaStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wa/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil status WhatsApp.");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil status WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch awal status — pola fetch-in-effect yang valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <>
      <Header title="WhatsApp Monitoring" subtitle="Status Cloud API & pesan masuk terkini" />
      <main className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {loading ? (
          <>
            <LoadingSkeleton rows={4} />
            <LoadingSkeleton rows={4} />
          </>
        ) : error || !data ? (
          <div className="rounded-2xl border border-red-200 bg-white dark:bg-night-800 p-6 text-center lg:col-span-2">
            <p className="text-sm font-medium text-red-600">{error || "Data tidak tersedia."}</p>
            <button
              onClick={load}
              className="btn-transition mt-3 rounded-xl bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
              <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Status Konfigurasi</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-night-400">
                Apakah credential Cloud API sudah dipasang (bukan status koneksi live).
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${data.configured ? "bg-emerald-400" : "bg-gray-300"}`} />
                <StatusBadge status={data.configured ? "active" : "inactive"} />
                <span className="text-xs text-gray-500 dark:text-night-400">
                  {data.configured ? "Siap menerima webhook" : "Belum lengkap"}
                </span>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <ConfigRow label="WhatsApp Business API" ok={data.configured} />
                <ConfigRow label="Phone Number ID" ok={data.phoneNumberConfigured} />
                <ConfigRow label="Webhook Verify Token" ok={data.webhookConfigured} />
                <ConfigRow label="App Secret (signature)" ok={data.appSecretConfigured} />
              </dl>
              <p className="mt-4 rounded-xl bg-cream dark:bg-night-700 p-3 text-xs text-gray-600 dark:text-night-400">
                Webhook endpoint: <code>/api/wa/webhook</code>. Lihat README untuk cara
                menghubungkan ke Meta (butuh URL publik HTTPS).
              </p>
            </section>

            <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
              <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Kesehatan API Aktual</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-night-400">
                Hasil health check ke Graph API saat halaman dibuka.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${
                    data.apiReachable === null
                      ? "bg-gray-300"
                      : data.apiReachable
                        ? "bg-emerald-400"
                        : "bg-red-400"
                  }`}
                />
                <span className="text-sm font-medium">
                  {data.apiReachable === null
                    ? "Tidak dicek (belum terkonfigurasi)"
                    : data.apiReachable
                      ? "API terjangkau"
                      : "API tidak terjangkau"}
                </span>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between border-b border-mist dark:border-night-600 pb-2">
                  <dt className="text-gray-500 dark:text-night-400">Nomor tampilan</dt>
                  <dd className="font-medium">{data.displayPhoneNumber ?? "—"}</dd>
                </div>
                <div className="flex justify-between border-b border-mist dark:border-night-600 pb-2">
                  <dt className="text-gray-500 dark:text-night-400">Nama terverifikasi</dt>
                  <dd className="font-medium">{data.verifiedName ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-night-400">Total pesan masuk</dt>
                  <dd className="font-medium">{data.totalInbound}</dd>
                </div>
              </dl>
            </section>

            <div className="lg:col-span-2">
              <LiveMessageFeed />
            </div>
          </>
        )}
      </main>
    </>
  );
}
