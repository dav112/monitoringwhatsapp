"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import CustomerTable from "@/components/CustomerTable";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useToast } from "@/components/Toast";
import type { ApiCustomer, CustomerInteraction, CustomerStatus, Pagination } from "@/lib/types";
import { STATUS_LABEL, formatDate } from "@/lib/types";

const LIMIT = 5;
const CITY_OPTIONS = ["Semua", "Bogor", "Jakarta", "Depok"];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "Semua", label: "Semua" },
  { value: "NEW", label: STATUS_LABEL.NEW },
  { value: "FOLLOW_UP", label: STATUS_LABEL.FOLLOW_UP },
  { value: "COMPLETED", label: STATUS_LABEL.COMPLETED },
];

export default function CustomersPage() {
  const { push } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [city, setCity] = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ApiCustomer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: LIMIT, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detail, setDetail] = useState<ApiCustomer | null>(null);
  const [interactions, setInteractions] = useState<CustomerInteraction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editStatus, setEditStatus] = useState<CustomerStatus | "">("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ApiCustomer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (debouncedQ) params.set("search", debouncedQ);
      if (city !== "Semua") params.set("city", city);
      if (status !== "Semua") params.set("status", status);
      const res = await fetch(`/api/customers?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil data customer.");
      setRows(json.data);
      setPagination(json.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data customer.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, city, status]);

  useEffect(() => {
    // Fetch awal + saat filter berubah — pola fetch-in-effect yang valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchList();
  }, [fetchList]);

  const openDetail = async (c: ApiCustomer) => {
    setDetail(c);
    setEditStatus(c.status);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil detail.");
      setDetail(json.data.customer);
      setEditStatus(json.data.customer.status);
      setInteractions(json.data.interactions);
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal mengambil detail customer.", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveStatus = async () => {
    if (!detail || !editStatus || editStatus === detail.status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan.");
      push("Status customer berhasil diupdate.", "success");
      setDetail(json.data);
      fetchList();
      openDetail(json.data);
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal menyimpan.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/customers/${deleting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menghapus.");
      push(`Customer ${deleting.name} berhasil dihapus.`, "success");
      setDeleting(null);
      if (detail?.id === deleting.id) setDetail(null);
      fetchList();
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal menghapus.", "error");
    }
  };

  return (
    <>
      <Header title="Customers" subtitle={`${pagination.total} customer • search, filter & pagination`} />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / nomor WA..."
            className="w-full flex-1 rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <div className="flex gap-2">
            <select
              value={city}
              onChange={(e) => { setCity(e.target.value); setPage(1); }}
              className="rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none"
            >
              {CITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none"
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-white dark:bg-night-800 p-6 text-center">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button
              onClick={fetchList}
              className="btn-transition mt-3 rounded-xl bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <CustomerTable rows={rows} onDetail={openDetail} onDelete={setDeleting} />
        )}

        <div className="flex items-center justify-between rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 px-4 py-3 text-sm">
          <p className="text-gray-500 dark:text-night-400">
            Hal {pagination.page} dari {pagination.totalPages} • {pagination.total} hasil
          </p>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn-transition rounded-lg bg-mist dark:bg-night-700 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-transition rounded-lg bg-brand-800 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </main>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detail Customer">
        {detailLoading ? (
          <p className="text-sm text-gray-500 dark:text-night-400">Memuat detail...</p>
        ) : detail ? (
          <div className="space-y-3">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-night-400">Nama</dt><dd className="font-medium">{detail.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-night-400">WA</dt><dd className="font-medium">{detail.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-night-400">Kota</dt><dd className="font-medium">{detail.city ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-night-400">Dibuat</dt><dd className="font-medium">{formatDate(detail.createdAt)}</dd></div>
              <div className="flex justify-between items-center"><dt className="text-gray-500 dark:text-night-400">Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
            </dl>
            <div className="flex gap-2">
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as CustomerStatus)}
                className="flex-1 rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none"
              >
                {(Object.keys(STATUS_LABEL) as CustomerStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <button
                onClick={saveStatus}
                disabled={saving || editStatus === detail.status}
                className="btn-transition rounded-xl bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
            {interactions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-night-400">Riwayat interaksi</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                  {interactions.map((i) => (
                    <li key={i.id} className="rounded-lg bg-cream dark:bg-night-700 px-2 py-1.5">
                      <span className="font-semibold">{i.type}</span> • {i.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              href={`/customers/${detail.id}`}
              className="btn-transition block rounded-xl bg-brand-100 dark:bg-night-700 px-4 py-2 text-center text-sm font-semibold text-brand-800 dark:text-night-100 hover:bg-brand-200 dark:hover:bg-night-600"
            >
              Buka Workspace →
            </Link>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Hapus Customer">
        {deleting && (
          <div className="text-sm">
            <p>Hapus <b>{deleting.name}</b> ({deleting.phone})? Tindakan ini tidak bisa dibatalkan.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleting(null)} className="btn-transition flex-1 rounded-xl bg-mist dark:bg-night-700 py-2 font-medium">
                Batal
              </button>
              <button onClick={confirmDelete} className="btn-transition flex-1 rounded-xl bg-red-600 py-2 font-medium text-white hover:bg-red-500">
                Hapus
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
