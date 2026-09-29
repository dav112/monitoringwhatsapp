"use client";

import { useSyncExternalStore } from "react";

const KEY = "wa-theme";

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getSnapshot(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export default function ThemeToggle() {
  // Reaktif terhadap class <html> tanpa setState-in-effect.
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // abaikan
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      aria-pressed={dark}
      title={dark ? "Mode terang" : "Mode gelap"}
      className="btn-transition rounded-xl bg-mist px-3 py-2 text-sm font-medium text-brand-900 hover:bg-stone-soft focus-visible:outline-2 focus-visible:outline-brand-600 dark:bg-night-700 dark:text-night-100 dark:hover:bg-night-600"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
