"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";

const CITY_OPTIONS = ["Semua", "Bogor", "Jakarta", "Depok"];
const STATUS_OPTIONS = [
  { value: "Semua", label: "Semua Status" },
  { value: "NEW", label: "Baru" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "COMPLETED", label: "Selesai" },
];

function isFiltered(search: string, city: string, status: string, from: string, to: string): boolean {
  return search !== "" || city !== "Semua" || status !== "Semua" || from !== "" || to !== "";
}

export default function ExportPage() {
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const queryString = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (city !== "Semua") p.set("city", city);
    if (status !== "Semua") p.set("status", status);
    if (from) p.set("startDate", from);
    if (to) p.set("endDate", to);
    return p.toString();
  }, [search, city, status, from, to]);

  const refreshCount = useCallback(async () => {
    setCounting(true);
    try {
      const res = await fetch(`/api/export/customers/count?${queryString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Gagal menghitung data.");
      setTotal(json.data.total);
    } catch (e) {
      setTotal(null);
      push(e instanceof Error ? e.message : "Gagal menghitung data.", "error");
    } finally {
      setCounting(false);
    }
  }, [queryString, push]);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshCount().catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [refreshCount]);

  const reset = () => {
    setSearch("");
    setCity("Semua");
    setStatus("Semua");
    setFrom("");
    setTo("");
  };

  const download = () => {
    if (exporting || total === 0) return;
    setExporting(true);
    push("Membuat file Excel...", "info");
    // Download via anchor: cookie session terkirim otomatis, tanpa blob di memory.
    const a = document.createElement("a");
    a.href = `/api/export/customers?${queryString()}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      setExporting(false);
      push("Excel berhasil dibuat.", "success");
    }, 3000);
  };

  const filtered = isFiltered(search, city, status, from, to);

  return (
    <>
      <Header title="Export Data" subtitle="Export seluruh customer sesuai filter ke Excel (.xlsx)" />
      <main className="p-4 sm:p-6">
        <section className="card-hover mx-auto max-w-xl rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Export Data Customer</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-night-400">
            {filtered ? "Export customer sesuai filter" : "Export seluruh customer"} — bukan hanya halaman saat ini.
          </p>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nama / nomor WA..."
            className="mt-4 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Kota
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none"
              >
                {CITY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Dari tanggal
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <label className="block text-sm font-medium">
              Sampai tanggal
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-cream dark:bg-night-700 px-4 py-3 text-sm">
            <span className="text-gray-600 dark:text-night-400">
              {counting || total === null ? (
                "Menghitung..."
              ) : total === 0 ? (
                "Tidak ada data customer yang sesuai dengan filter."
              ) : (
                <>
                  Ditemukan <b>{total.toLocaleString("id-ID")} customer</b>
                </>
              )}
            </span>
            <button onClick={reset} className="btn-transition text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
              Reset Filter
            </button>
          </div>

          <button
            onClick={download}
            disabled={exporting || total === 0 || total === null}
            className="btn-transition mt-4 w-full rounded-xl bg-brand-800 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
          <p className="mt-3 text-center text-xs text-gray-500 dark:text-night-400">
            Kolom: Nama • Nomor WA • Kota • Status • Tanggal Dibuat • Tanggal Diperbarui (WIB).
          </p>
        </section>
      </main>
    </>
  );
}
