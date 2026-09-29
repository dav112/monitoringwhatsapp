"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: ("ADMIN" | "SUPERVISOR" | "CS")[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "◈", roles: ["ADMIN", "SUPERVISOR", "CS"] },
  { href: "/customers", label: "Customers", icon: "○", roles: ["ADMIN", "SUPERVISOR", "CS"] },
  { href: "/whatsapp", label: "WhatsApp", icon: "✦", roles: ["ADMIN", "SUPERVISOR", "CS"] },
  { href: "/tutorial", label: "Tutorial", icon: "📖", roles: ["ADMIN", "SUPERVISOR", "CS"] },
  { href: "/export", label: "Export", icon: "⇩", roles: ["ADMIN", "SUPERVISOR"] },
  { href: "/users", label: "Users", icon: "◍", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", icon: "⚙", roles: ["ADMIN", "SUPERVISOR"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // Role dari session server (tampilan saja; proteksi nyata di proxy + API).
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.ok) setRole((await r.json()).data.user.role as string);
      })
      .catch(() => {});
  }, []);

  const visible = NAV.filter((item) => !role || item.roles.includes(role as NavItem["roles"][number]));
  // ^ sebelum role diketahui tampilkan semua agar tak ada lompatan layout;
  // proxy tetap mengarahkan forbidden ke /dashboard.

  return (
    <>
      {/* mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="btn-transition fixed bottom-5 right-5 z-40 rounded-full bg-brand-800 px-4 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
        aria-label="Toggle menu"
      >
        {open ? "Tutup" : "Menu"}
      </button>

      {/* overlay */}
      {open && (
        <div
          className="modal-backdrop fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`sidebar-transition fixed z-30 flex h-full w-64 flex-col bg-white dark:bg-night-800 px-5 py-6 lg:sticky lg:top-0 lg:h-screen ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } border-r border-stone-soft dark:border-night-600`}
      >
        <Link href="/dashboard" className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 dark:bg-night-700 text-lg font-bold text-brand-800 dark:text-night-100">
            W
          </span>
          <span>
            <span className="block text-sm font-bold text-brand-900 dark:text-night-100">MONITORING WA</span>
            <span className="block text-xs text-gray-500 dark:text-night-400">Customer Dashboard</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Navigasi utama">
          {visible.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`btn-transition flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600 ${
                  active
                    ? "bg-brand-100 dark:bg-night-700 text-brand-900 dark:text-night-100"
                    : "text-gray-600 dark:text-night-400 hover:bg-cream dark:hover:bg-night-700 dark:bg-night-700 hover:text-brand-900 dark:text-night-100"
                }`}
              >
                <span className="w-5 text-center" aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-xl bg-cream dark:bg-night-700 p-3 text-xs text-gray-600 dark:text-night-400">
          <p className="font-semibold text-brand-900 dark:text-night-100">Monitoring WhatsApp</p>
          <p className="mt-1">Data live dari database.</p>
        </div>
      </aside>
    </>
  );
}
