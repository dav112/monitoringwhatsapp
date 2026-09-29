import type { ApiCustomer } from "@/lib/types";
import { formatDate } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export default function CustomerTable({
  rows,
  onDetail,
  onDelete,
}: {
  rows: ApiCustomer[];
  onDetail: (c: ApiCustomer) => void;
  onDelete?: (c: ApiCustomer) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-soft dark:border-night-600 bg-cream dark:bg-night-700 text-xs uppercase tracking-wide text-gray-500 dark:text-night-400">
            <th className="px-4 py-3 font-medium">Nama</th>
            <th className="px-4 py-3 font-medium">Nomor WhatsApp</th>
            <th className="px-4 py-3 font-medium">Kota</th>
            <th className="px-4 py-3 font-medium">Tanggal</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="row-hover border-b border-mist dark:border-night-600 last:border-0 hover:bg-cream dark:hover:bg-night-700 dark:bg-night-700">
              <td className="px-4 py-3 font-medium text-brand-900 dark:text-night-100">{c.name}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-night-400">{c.phone}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-night-400">{c.city ?? "—"}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-night-400">{formatDate(c.createdAt)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => onDetail(c)}
                    className="btn-transition rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50 dark:bg-night-700 dark:text-night-100 dark:hover:bg-night-600"
                  >
                    Detail
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(c)}
                      className="btn-transition rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-night-400">
                Tidak ada data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
