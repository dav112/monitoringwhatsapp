"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import WhatsAppConfigCard from "@/components/WhatsAppConfigCard";
import { useToast } from "@/components/Toast";

const TOGGLE_KEYS = [
  { key: "save_name", label: "Simpan nama", desc: "Simpan nama customer dari chat" },
  { key: "save_phone", label: "Simpan nomor WhatsApp", desc: "Simpan nomor pengirim" },
  { key: "save_city", label: "Simpan kota", desc: "Simpan jawaban kota" },
  { key: "save_timestamp", label: "Simpan timestamp", desc: "Simpan waktu pesan" },
  { key: "auto_city_detection", label: "Deteksi kota otomatis", desc: "Tebak kota dari teks" },
] as const;

export default function SettingsPage() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil pengaturan.");
      setQuestion(json.data.city_question ?? "");
      const t: Record<string, boolean> = {};
      for (const { key } of TOGGLE_KEYS) t[key] = json.data[key] === "true";
      setToggles(t);
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal mengambil pengaturan.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch awal settings — pola fetch-in-effect yang valid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = (key: string) => setToggles((p) => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true);
    try {
      const values: Record<string, string> = { city_question: question };
      for (const { key } of TOGGLE_KEYS) values[key] = toggles[key] ? "true" : "false";
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan pengaturan.");
      push("Pengaturan berhasil disimpan.", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal menyimpan pengaturan.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Pertanyaan kota & penyimpanan data" />
      <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        {loading ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <>
            <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
              <h2 className="text-sm font-bold">Pertanyaan Kota</h2>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              />
              <div className="mt-3 rounded-xl bg-cream dark:bg-night-700 p-3 text-sm">
                <p className="text-xs text-gray-500 dark:text-night-400">Pratinjau chat:</p>
                <p className="mt-1 font-medium">Bot: {question}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
              <h2 className="text-sm font-bold">Penyimpanan Data</h2>
              <ul className="mt-3 divide-y divide-mist dark:divide-night-600">
                {TOGGLE_KEYS.map((it) => (
                  <li key={it.key} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{it.label}</p>
                      <p className="text-xs text-gray-500 dark:text-night-400">{it.desc}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={!!toggles[it.key]}
                      onClick={() => flip(it.key)}
                      className={`btn-transition relative h-6 w-11 rounded-full ${toggles[it.key] ? "bg-brand-600" : "bg-gray-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-night-800 shadow transition-all ${toggles[it.key] ? "left-[22px]" : "left-0.5"}`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={save}
                disabled={saving}
                className="btn-transition mt-4 w-full rounded-xl bg-brand-800 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Pengaturan"}
              </button>
            </section>

            <WhatsAppConfigCard />
          </>
        )}
      </main>
    </>
  );
}
