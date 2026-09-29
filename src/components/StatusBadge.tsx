import { STATUS_LABEL } from "@/lib/types";

const MAP: Record<string, string> = {
  // Step 2 — status database
  NEW: "bg-brand-100 dark:bg-night-700 text-brand-800 dark:text-night-100",
  FOLLOW_UP: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  // Legacy mock Step 1 (customers mock, whatsapp mock)
  baru: "bg-brand-100 dark:bg-night-700 text-brand-800 dark:text-night-100",
  aktif: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  nonaktif: "bg-gray-200 text-gray-600 dark:text-night-400",
  connected: "bg-emerald-100 text-emerald-800",
  disconnected: "bg-red-100 text-red-700",
  active: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  inactive: "bg-gray-200 text-gray-600 dark:text-night-400",
  INACTIVE: "bg-gray-200 text-gray-600 dark:text-night-400",
  Admin: "bg-brand-800 text-white",
  ADMIN: "bg-brand-800 text-white",
  Supervisor: "bg-brand-100 dark:bg-night-700 text-brand-800 dark:text-night-100",
  SUPERVISOR: "bg-brand-100 dark:bg-night-700 text-brand-800 dark:text-night-100",
  CS: "bg-mist dark:bg-night-700 text-brand-900 dark:text-night-100",
};

const LABEL: Record<string, string> = { ...STATUS_LABEL };

export default function StatusBadge({ status }: { status: string }) {
  const cls = MAP[status] ?? "bg-mist dark:bg-night-700 text-gray-700 dark:text-night-100";
  const label = LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}
    >
      {label}
    </span>
  );
}
