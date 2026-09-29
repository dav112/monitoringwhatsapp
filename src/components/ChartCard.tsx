export default function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-night-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
