"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useToast } from "@/components/Toast";
import type { ApiUser } from "@/lib/types";

export default function UsersPage() {
  const { push } = useToast();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil data users.");
      setUsers(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch awal users — pola fetch-in-effect yang valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.ok) {
          const json = await r.json();
          setIsAdmin(json.data.user.role === "ADMIN");
        }
      })
      .catch(() => {});
  }, []);

  const toggleStatus = async (u: ApiUser) => {
    const next = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setActing(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Gagal mengupdate user.");
      push(`User ${u.name} → ${next === "ACTIVE" ? "aktif" : "nonaktif"}.`, "success");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal mengupdate user.", "error");
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <Header title="Users" subtitle="Kelola pengguna • Admin / Supervisor / CS" />
      <main className="p-4 sm:p-6">
        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-white dark:bg-night-800 p-6 text-center">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button
              onClick={load}
              className="btn-transition mt-3 rounded-xl bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-soft dark:border-night-600 bg-cream dark:bg-night-700 text-xs uppercase tracking-wide text-gray-500 dark:text-night-400">
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">Action</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="row-hover border-b border-mist dark:border-night-600 last:border-0 hover:bg-cream dark:hover:bg-night-700 dark:bg-night-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-900 dark:text-night-100">{u.name}</p>
                      <p className="text-xs text-gray-500 dark:text-night-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-night-400">
                      {u.lastActiveAt
                        ? new Date(u.lastActiveAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleStatus(u)}
                          disabled={acting === u.id}
                          className="btn-transition rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50 dark:bg-night-700 dark:text-night-100 dark:hover:bg-night-600"
                        >
                          {acting === u.id
                            ? "..."
                            : u.status === "ACTIVE"
                              ? "Nonaktifkan"
                              : "Aktifkan"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
