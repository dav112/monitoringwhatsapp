import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth";

/** Lapis kedua proteksi halaman: pastikan session valid & user masih ACTIVE. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen bg-cream dark:bg-night-700">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="page-enter flex-1">{children}</div>
        <footer className="px-4 py-4 text-center text-xs text-gray-400 dark:text-night-400 sm:px-6 sm:text-left">
          Monitoring WhatsApp • {user.name} ({user.role})
        </footer>
      </div>
    </div>
  );
}
