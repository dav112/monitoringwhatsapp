"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import StatCard from "@/components/StatCard";
import ChartCard from "@/components/ChartCard";
import GrowthChart from "@/components/GrowthChart";
import CityDistribution from "@/components/CityDistribution";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import type { DashboardData, WaStatusData } from "@/lib/types";
import { formatDate } from "@/lib/types";

const CITY_COLORS = ["#1d8a52", "#34b06a", "#a8e6a1", "#d6dacd", "#b9c2b3"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [wa, setWa] = useState<WaStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashRes, waRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/wa/status"),
      ]);
      const dashJson = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashJson.error ?? "Gagal mengambil statistik dashboard.");
      setData(dashJson.data);
      if (waRes.ok) {
        const waJson = await waRes.json();
        setWa(waJson.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil statistik dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch awal dashboard — pola fetch-in-effect yang valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <>
      <Header title="Dashboard" subtitle="Ringkasan customer & status WhatsApp terkini" />
      <main className="space-y-4 p-4 sm:space-y-5 sm:p-6">
        {loading ? (
          <LoadingSkeleton rows={6} />
        ) : error || !data ? (
          <div className="rounded-2xl border border-red-200 bg-white dark:bg-night-800 p-6 text-center">
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
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <StatCard label="Total Customer" value={String(data.totalCustomers)} hint="Semua waktu" glow />
              <StatCard label="Customer Hari Ini" value={String(data.customersToday)} hint="Hari ini" glow />
              <StatCard label="7 Hari Terakhir" value={String(data.customersThisWeek)} hint="Periode berjalan" />
              <StatCard label="30 Hari Terakhir" value={String(data.customersThisMonth)} hint="Periode berjalan" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartCard title="Customer Growth" subtitle="14 hari terakhir">
                  <GrowthChart series={data.growth14d} />
                </ChartCard>
              </div>
              <ChartCard title="Distribusi per Kota" subtitle="Per kota">
                <CityDistribution
                  cities={data.customersByCity.map((c, i) => ({
                    city: c.city ?? "Belum diketahui",
                    count: c.count,
                    color: CITY_COLORS[i % CITY_COLORS.length],
                  }))}
                />
              </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Customer Terbaru</h2>
                  <Link href="/customers" className="btn-transition text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
                    Lihat semua
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <tbody>
                      {data.recentCustomers.map((c) => (
                        <tr key={c.id} className="row-hover border-b border-mist dark:border-night-600 last:border-0 hover:bg-cream dark:hover:bg-night-700 dark:bg-night-700">
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-brand-900 dark:text-night-100">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-night-400">{c.phone} • {c.city ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-night-400">{formatDate(c.createdAt)}</td>
                          <td className="py-2.5 text-right">
                            <StatusBadge status={c.status} />
                          </td>
                        </tr>
                      ))}
                      {data.recentCustomers.length === 0 && (
                        <tr><td className="py-6 text-center text-gray-500 dark:text-night-400">Belum ada customer.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5">
                <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">WhatsApp Status</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-night-400">dari /api/wa/status</p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      wa?.configured ? "bg-emerald-400" : "bg-gray-300"
                    }`}
                  />
                  <StatusBadge status={wa?.configured ? "active" : "inactive"} />
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">Konfigurasi</dt>
                    <dd className="text-right font-medium text-brand-900 dark:text-night-100">
                      {wa ? (wa.configured ? "Terkonfigurasi" : "Belum dikonfigurasi") : "…"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">API</dt>
                    <dd className="text-right font-medium text-brand-900 dark:text-night-100">
                      {wa?.apiReachable === null || wa?.apiReachable === undefined
                        ? "Belum dicek"
                        : wa.apiReachable
                          ? "Terjangkau"
                          : "Tidak terjangkau"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 dark:text-night-400">Pesan masuk</dt>
                    <dd className="text-right font-medium text-brand-900 dark:text-night-100">
                      {wa ? wa.totalInbound : "…"}
                    </dd>
                  </div>
                </dl>
                <Link
                  href="/whatsapp"
                  className="btn-transition mt-4 block rounded-xl bg-brand-800 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
                >
                  Buka Monitoring
                </Link>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
