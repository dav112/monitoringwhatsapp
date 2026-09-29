"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

type State = "idle" | "loading" | "error" | "success";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  // Sudah login → ke dashboard (middleware juga mengarahkan).
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.ok) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(
          typeof json.error === "string" ? json.error : "Invalid email or password.",
        );
        return;
      }
      setState("success");
      router.replace("/dashboard");
    } catch {
      setState("error");
      setError("Tidak dapat terhubung ke server.");
    }
  };

  return (
    <main className="page-enter relative flex min-h-screen items-center justify-center bg-cream p-4 dark:bg-night-900">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="grid w-full max-w-3xl overflow-hidden rounded-3xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 sm:grid-cols-2">
        <div className="hidden flex-col justify-between bg-brand-800 p-8 text-white sm:flex">
          <div>
            <p className="text-sm font-bold">MONITORING WA</p>
            <h1 className="mt-4 text-2xl font-bold leading-snug">
              Customer WhatsApp Data Dashboard
            </h1>
            <p className="mt-2 text-sm text-brand-100">
              Pantau customer, koneksi WA, dan export data dalam satu tempat.
            </p>
          </div>
          <p className="text-xs text-brand-200">Login dengan akun terdaftar</p>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8">
          <h2 className="text-xl font-bold text-brand-900 dark:text-night-100">Masuk</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-night-400">
            Masukkan email dan password akun Anda.
          </p>
          <label className="mt-6 block text-sm font-medium text-brand-900 dark:text-night-100">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2.5 outline-none focus:border-brand-400"
              placeholder="admin@example.local"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-brand-900 dark:text-night-100">
            Password
            <span className="mt-1 flex gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2.5 outline-none focus:border-brand-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="btn-transition shrink-0 rounded-xl bg-mist dark:bg-night-700 px-3 py-2 text-xs font-medium text-brand-900 dark:text-night-100 hover:bg-stone-soft focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {state === "error" && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
          )}
          <button
            disabled={state === "loading" || state === "success"}
            className="btn-transition mt-6 w-full rounded-xl bg-brand-800 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {state === "loading" ? "Signing in..." : state === "success" ? "Berhasil..." : "Masuk Dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}
