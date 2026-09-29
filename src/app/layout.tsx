import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Monitoring WhatsApp — Customer Dashboard",
  description: "Customer WhatsApp Data Dashboard — monitoring, workspace & export",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("wa-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-cream text-brand-900 dark:bg-night-900 dark:text-night-100">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
