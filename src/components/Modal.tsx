"use client";

import { useEffect, useRef } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Fokus ke panel saat dibuka agar keyboard user langsung di dalam modal.
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="modal-backdrop absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-panel relative w-full max-w-md rounded-2xl bg-white dark:bg-night-800 p-5 shadow-xl outline-none sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-900 dark:text-night-100">{title}</h2>
          <button
            onClick={onClose}
            className="btn-transition rounded-lg px-2 py-1 text-gray-500 dark:text-night-400 hover:bg-mist dark:hover:bg-night-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
