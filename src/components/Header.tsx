"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import ThemeToggle from "./ThemeToggle";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  // Info user dari session server (bukan state frontend yang bisa dimanipulasi).
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return;
        }
        if (r.ok) {
          const json = await r.json();
          setMe(json.data.user);
        }
      })
      .catch(() => {});
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  };

  const demoNotify = () => push("Notifikasi contoh — toast bekerja.", "success");

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900/90 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div>
        <h1 className="text-lg font-bold text-brand-900 dark:text-night-100 sm:text-xl">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 dark:text-night-400 sm:text-sm">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {me && (
          <span className="hidden rounded-full bg-brand-100 dark:bg-night-700 px-3 py-1 text-xs font-medium text-brand-800 dark:text-night-100 sm:inline">
            {me.name} • {me.role}
          </span>
        )}
        <button
          onClick={demoNotify}
          className="btn-transition hidden rounded-xl bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 sm:px-4 md:inline"
        >
          Cek Notif
        </button>
        <button
          onClick={logout}
          className="btn-transition rounded-xl bg-mist dark:bg-night-700 px-3 py-2 text-sm font-medium text-brand-900 dark:text-night-100 hover:bg-stone-soft sm:px-4"
        >
          Logout
        </button>
        <ThemeToggle />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-200 text-sm font-bold text-brand-900">
          {me ? me.name.charAt(0).toUpperCase() : "•"}
        </span>
      </div>
    </header>
  );
}
