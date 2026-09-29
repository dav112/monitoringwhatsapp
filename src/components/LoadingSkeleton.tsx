export default function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-4" aria-busy="true">
      <div className="skeleton mb-3 h-5 w-1/3 rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton mb-2 h-10 w-full rounded-xl" />
      ))}
    </div>
  );
}
