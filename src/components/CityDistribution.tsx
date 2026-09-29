export default function CityDistribution({
  cities,
}: {
  cities: { city: string; count: number; color: string }[];
}) {
  const total = cities.reduce((a, c) => a + c.count, 0);
  return (
    <div>
      {/* bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-mist dark:bg-night-700">
        {cities.map((c) => (
          <div
            key={c.city}
            title={`${c.city}: ${c.count}`}
            style={{ width: `${(c.count / total) * 100}%`, background: c.color }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {cities.map((c) => (
          <li key={c.city} className="flex items-center gap-3 text-sm">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: c.color }}
            />
            <span className="flex-1 font-medium text-brand-900 dark:text-night-100">{c.city}</span>
            <span className="text-gray-600 dark:text-night-400">{c.count}</span>
            <span className="w-12 text-right text-xs text-gray-400 dark:text-night-400">
              {Math.round((c.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
