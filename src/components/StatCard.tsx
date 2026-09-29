import GlowCard from "./GlowCard";

export default function StatCard({
  label,
  value,
  hint,
  glow = false,
}: {
  label: string;
  value: string;
  hint?: string;
  glow?: boolean;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-gray-500 dark:text-night-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-900 dark:text-night-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-night-400">{hint}</p>}
    </>
  );
  const cls =
    "card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5";
  if (glow) {
    return <GlowCard className={cls}>{inner}</GlowCard>;
  }
  return <div className={cls}>{inner}</div>;
}
