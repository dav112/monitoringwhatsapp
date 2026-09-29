"use client";

import { useEffect, useRef } from "react";

/** GlowCard: cursor-follow glow ringan, rAF-throttled, hormati reduced-motion. */
export default function GlowCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
        el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
      });
    };
    el.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={ref} className={`glow-card ${className}`}>
      {children}
    </div>
  );
}
