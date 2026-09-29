"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastItem = { id: number; msg: string; kind: "success" | "info" | "error" };
const Ctx = createContext<{ push: (msg: string, kind?: ToastItem["kind"]) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((msg: string, kind: ToastItem["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, kind }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === "success"
                ? "border-brand-200 bg-white dark:bg-night-800 text-brand-900 dark:text-night-100"
                : t.kind === "error"
                  ? "border-red-200 bg-white dark:bg-night-800 text-red-700"
                  : "border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 text-gray-700 dark:text-night-100"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
