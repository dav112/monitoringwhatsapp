"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useToast } from "./Toast";

interface WaConfigStatus {
  configured: boolean;
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountIdConfigured: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  source: "database" | "env" | "none";
}

const SECRET_FIELDS = [
  { key: "accessToken", label: "Access Token", desc: "Token Graph API Meta. Rahasia — terenkripsi di database.", flag: "accessTokenConfigured" as const, clearKey: "accessToken" as const },
  { key: "verifyToken", label: "Verify Token", desc: "String bebas untuk verifikasi webhook Meta. Rahasia — terenkripsi.", flag: "verifyTokenConfigured" as const, clearKey: "verifyToken" as const },
  { key: "appSecret", label: "App Secret", desc: "Kunci validasi signature webhook (X-Hub-Signature-256). Rahasia.", flag: "appSecretConfigured" as const, clearKey: "appSecret" as const },
];

const ID_FIELDS = [
  { key: "phoneNumberId", label: "Phone Number ID", desc: "ID nomor WhatsApp Business (angka, dari Meta App Dashboard).", flag: "phoneNumberIdConfigured" as const, clearKey: "phoneNumberId" as const },
  { key: "businessAccountId", label: "Business Account ID", desc: "ID akun bisnis WhatsApp (angka, opsional).", flag: "businessAccountIdConfigured" as const, clearKey: "businessAccountId" as const },
];

export default function WhatsAppConfigCard() {
  const { push } = useToast();
  const [status, setStatus] = useState<WaConfigStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [clearTarget, setClearTarget] = useState<{ key: string; label: string } | null>(null);

  const load = async () => {
    try {
      const [cfgRes, meRes] = await Promise.all([fetch("/api/wa/config"), fetch("/api/auth/me")]);
      const json = await cfgRes.json();
      if (!cfgRes.ok) throw new Error(json.error ?? "Gagal mengambil konfigurasi.");
      setStatus(json.data);
      if (meRes.ok) {
        const me = await meRes.json();
        setIsAdmin(me.data.user.role === "ADMIN");
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal mengambil konfigurasi WhatsApp.", "error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const k of Object.keys(values)) {
        if (values[k] !== "") body[k] = values[k];
      }
      const res = await fetch("/api/wa/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan.");
      setStatus(json.data);
      setValues({});
      push("Konfigurasi WhatsApp tersimpan (secret terenkripsi).", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal menyimpan.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmClear = async () => {
    if (!clearTarget) return;
    try {
      const res = await fetch("/api/wa/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: [clearTarget.key] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menghapus.");
      setStatus(json.data);
      push(`${clearTarget.label} dihapus.`, "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Gagal menghapus.", "error");
    } finally {
      setClearTarget(null);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/wa/test-connection", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test gagal.");
      setTestResult(json.data.reachable ? `✓ ${json.data.message}` : `✕ ${json.data.message}`);
    } catch (e) {
      setTestResult(`✕ ${e instanceof Error ? e.message : "Test gagal."}`);
    } finally {
      setTesting(false);
    }
  };

  const badge = (ok: boolean) => (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-500 dark:text-night-400"
      }`}
    >
      {ok ? "Configured ✓" : "Belum diisi"}
    </span>
  );

  return (
    <section className="card-hover rounded-2xl border border-stone-soft dark:border-night-600 bg-white dark:bg-night-800 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">WhatsApp API Configuration</h2>
        {status && badge(status.configured)}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-night-400">
        Kelola credential Meta Cloud API tanpa mengedit .env. Secret terenkripsi (AES-256) dan
        tidak pernah ditampilkan kembali. {status?.source === "env" && "Saat ini memakai fallback .env."}
      </p>

      {!isAdmin && status && (
        <p className="mt-3 rounded-xl bg-cream dark:bg-night-700 p-3 text-sm text-gray-600 dark:text-night-400">
          Hanya ADMIN yang boleh mengubah konfigurasi ini. Anda dapat melihat status di atas.
        </p>
      )}

      {isAdmin && (
      <>
      <div className="mt-4 space-y-4">
        {SECRET_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-brand-900 dark:text-night-100">{f.label}</label>
              {status && badge(status[f.flag])}
            </div>
            <p className="text-xs text-gray-500 dark:text-night-400">{f.desc}</p>
            <div className="mt-1 flex gap-2">
              <input
                type={show[f.key] ? "text" : "password"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={status?.[f.flag] ? "•••••••• (terisi — kosongkan untuk pertahankan)" : `Masukkan ${f.label}`}
                autoComplete="off"
                className="flex-1 rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
              <button
                onClick={() => setShow((p) => ({ ...p, [f.key]: !p[f.key] }))}
                className="btn-transition rounded-xl bg-mist dark:bg-night-700 px-3 py-2 text-xs font-medium"
              >
                {show[f.key] ? "Hide" : "Show"}
              </button>
              {status?.[f.flag] && (
                <button
                  onClick={() => setClearTarget({ key: f.clearKey, label: f.label })}
                  className="btn-transition rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ))}

        {ID_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-brand-900 dark:text-night-100">{f.label}</label>
              {status && badge(status[f.flag])}
            </div>
            <p className="text-xs text-gray-500 dark:text-night-400">{f.desc}</p>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={status?.[f.flag] ? "(terisi — kosongkan untuk pertahankan)" : `Masukkan ${f.label}`}
                autoComplete="off"
                className="flex-1 rounded-xl border border-stone-soft dark:border-night-600 bg-paper dark:bg-night-900 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
              {status?.[f.flag] && (
                <button
                  onClick={() => setClearTarget({ key: f.clearKey, label: f.label })}
                  className="btn-transition rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={save}
          disabled={saving}
          className="btn-transition flex-1 rounded-xl bg-brand-800 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
        </button>
        <button
          onClick={testConnection}
          disabled={testing}
          className="btn-transition flex-1 rounded-xl bg-brand-100 dark:bg-night-700 py-2.5 text-sm font-semibold text-brand-800 dark:text-night-100 hover:bg-brand-200 dark:hover:bg-night-600 disabled:opacity-60"
        >
          {testing ? "Menguji..." : "Test Connection"}
        </button>
      </div>
      {testResult && (
        <p className={`mt-2 rounded-xl p-3 text-sm ${testResult.startsWith("✓") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {testResult}
        </p>
      )}
      <p className="mt-3 rounded-xl bg-cream dark:bg-night-700 p-3 text-xs text-gray-600 dark:text-night-400">
        Hanya ADMIN yang boleh mengubah. Field kosong saat Simpan = pertahankan nilai lama.
      </p>
      </>
      )}

      <Modal open={!!clearTarget} onClose={() => setClearTarget(null)} title="Hapus Credential">
        {clearTarget && (
          <div className="text-sm">
            <p>
              Hapus <b>{clearTarget.label}</b>? Webhook/status yang memakai nilai ini akan ikut
              berubah. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setClearTarget(null)} className="btn-transition flex-1 rounded-xl bg-mist dark:bg-night-700 py-2 font-medium">
                Batal
              </button>
              <button onClick={confirmClear} className="btn-transition flex-1 rounded-xl bg-red-600 py-2 font-medium text-white hover:bg-red-500">
                Hapus
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
