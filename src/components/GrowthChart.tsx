"use client";

import { useState } from "react";

/** Grafik garis SVG ringan, tanpa library. Tooltip via CSS. */
export default function GrowthChart({
  series,
}: {
  series: { label: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 180;
  const PAD = 28;
  const max = Math.max(...series.map((s) => s.value)) * 1.15;
  const stepX = (W - PAD * 2) / (series.length - 1);

  const pts = series.map((s, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (s.value / max) * (H - PAD * 2),
    ...s,
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${H - PAD} L${pts[0].x},${H - PAD} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Grafik pertumbuhan customer"
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={H - PAD - f * (H - PAD * 2)}
            y2={H - PAD - f * (H - PAD * 2)}
            strokeWidth={1}
            className="stroke-mist dark:stroke-night-600"
          />
        ))}
        <path d={area} opacity={0.7} className="fill-brand-100 dark:fill-night-700" />
        <path d={line} fill="none" strokeWidth={2.5} strokeLinecap="round" className="stroke-brand-600 dark:stroke-brand-400" />
        {pts.map((p, i) => (
          <g key={p.label}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 3.5}
              strokeWidth={2}
              className={
                hover === i
                  ? "fill-brand-800 stroke-white dark:fill-brand-300 dark:stroke-night-800"
                  : "fill-brand-500 stroke-white dark:stroke-night-800"
              }
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            />
            {/* hit area */}
            <rect
              x={p.x - stepX / 2}
              y={0}
              width={stepX}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip pointer-events-none absolute rounded-xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `min(max(${(pts[hover].x / W) * 100}%, 60px), calc(100% - 120px))`,
            top: 0,
          }}
        >
          <p className="font-bold text-brand-900 dark:text-night-100">{pts[hover].value} customer</p>
          <p className="text-gray-500 dark:text-night-400">{pts[hover].label}</p>
        </div>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-gray-400 dark:text-night-400">
        <span>{series[0].label}</span>
        <span>{series[series.length - 1].label}</span>
      </div>
    </div>
  );
}
