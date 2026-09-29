"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import SetupStatusPanel from "@/components/SetupStatusPanel";

const META_DOCS = {
  developers: "https://developers.facebook.com/",
  waGetStarted: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  waDocs: "https://developers.facebook.com/docs/whatsapp",
  webhooks: "https://developers.facebook.com/docs/graph-api/webhooks/getting-started",
};

function DocLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-transition font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300"
    >
      📚 {children ?? "Dokumentasi resmi Meta"}
    </a>
  );
}

function Callout({ kind, children }: { kind: "warn" | "info" | "ok"; children: ReactNode }) {
  const styles = {
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-brand-200 bg-brand-50 text-brand-900 dark:border-night-600 dark:bg-night-700 dark:text-night-100",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return <div className={`mt-3 rounded-xl border p-3 text-sm ${styles[kind]}`}>{children}</div>;
}

function CodeBlock({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-2 overflow-x-auto rounded-xl bg-brand-900 p-3 text-sm text-brand-100">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <code className="min-w-0 break-all">{label ?? value}</code>
        <button
          onClick={copy}
          aria-label={`Copy ${label ?? value}`}
          className="btn-transition shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-stone-soft bg-white dark:border-night-600 dark:bg-night-800">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-transition flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-900 hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-night-100 dark:hover:bg-night-700"
      >
        {title}
        <span aria-hidden="true" className="text-gray-400 dark:text-night-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-mist px-4 py-3 text-sm text-gray-700 dark:border-night-600 dark:text-night-100">{children}</div>}
    </div>
  );
}

function Step({
  n,
  title,
  children,
  technical,
  mode,
  checked,
  onToggle,
  stepId,
  stepRef,
}: {
  n: string;
  title: string;
  children: ReactNode;
  technical?: ReactNode;
  mode: "pemula" | "lanjutan";
  checked?: boolean;
  onToggle?: () => void;
  stepId?: string;
  stepRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      id={stepId}
      ref={stepRef}
      aria-label={`Step ${n}: ${title}`}
      className={`card-hover scroll-mt-4 rounded-2xl border bg-white p-5 transition-colors dark:bg-night-800 ${
        checked
          ? "border-brand-500 shadow-[0_0_0_2px_var(--color-brand-200)] dark:border-brand-500 dark:shadow-[0_0_0_2px_var(--color-brand-800)]"
          : "border-stone-soft dark:border-night-600"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800 dark:bg-night-700 dark:text-night-100" aria-hidden="true">
          {n}
        </span>
        <h2 className="min-w-0 flex-1 text-base font-bold text-brand-900 dark:text-night-100">{title}</h2>
        {onToggle && (
          <button
            onClick={onToggle}
            role="checkbox"
            aria-checked={!!checked}
            aria-label={`Tandai step ${n} selesai`}
            title={checked ? "Selesai — klik untuk batalkan" : "Tandai selesai"}
            className={`btn-transition flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 text-base font-bold focus-visible:outline-2 focus-visible:outline-brand-600 ${
              checked
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-stone-soft bg-mist/60 text-transparent hover:border-brand-400 dark:border-night-600 dark:bg-night-700"
            }`}
          >
            <span aria-hidden="true">✓</span>
          </button>
        )}
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-night-100">{children}</div>
      {mode === "lanjutan" && technical && (
        <div className="mt-3 rounded-xl bg-cream p-3 text-sm text-gray-700 dark:bg-night-700 dark:text-night-100">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-800 dark:text-night-100">Buat yang penasaran (teknis)</p>
          {technical}
        </div>
      )}
    </section>
  );
}

const CHECKLIST = [
  "Siapkan akun Meta",
  "Buat WhatsApp Business Account",
  "Siapkan nomor WhatsApp Business",
  "Buat / hubungkan App",
  "Ambil Access Token",
  "Ambil WABA ID",
  "Ambil Phone Number ID",
  "Siapkan Webhook",
  "Subscribe ke WABA",
  "Masukkan data ke dashboard",
  "Test Connection",
  "Kirim test message",
  "Pastikan pesan masuk realtime",
];
const LS_KEY = "tutorial-checklist-v1";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "WABA ID itu apa?",
    a: "ID akun WhatsApp Business lu — beda sama nomor HP dan beda sama Phone Number ID. Angkanya mirip-mirip (15 digit), makanya gampang ketuker. Cek tabel perbandingan di Step 9.",
  },
  {
    q: "Phone Number ID itu nomor HP bukan?",
    a: "Bukan. Nomor HP lu itu kayak +62 812-xxxx-xxxx, sedangkan Phone Number ID itu ID internal Meta buat nomor tersebut (contoh: 123456789012345). Jangan isi Phone Number ID pakai nomor HP.",
  },
  {
    q: "Access Token itu aman nggak?",
    a: "Aman selama lu yang pegang dan cuma dipasang di server dashboard ini. Jangan screenshot, jangan kirim ke orang, jangan taruh di GitHub. Kalau kecurigaan bocor, generate ulang dari Meta.",
  },
  {
    q: "Kenapa webhook harus HTTPS?",
    a: "Karena Meta cuma mau ngomong ke server yang aman dan bisa dijangkau publik. localhost nggak bisa dijangkau Meta, jadi buat development pakai tunnel, buat production pakai domain + HTTPS.",
  },
  {
    q: "Kenapa pesan WhatsApp nggak masuk?",
    a: "Urutan ceknya: webhook URL public? verify token sama? App Secret bener? App sudah subscribe ke WABA + event messages aktif? 90% kasus nyangkut di salah satu itu. Detailnya ada di Troubleshooting C.",
  },
  {
    q: "Kenapa Test Connection berhasil tapi pesan nggak masuk?",
    a: "Karena Test Connection cuma ngetes kredensial API (server → Meta). Pesan masuk itu arah sebaliknya (Meta → webhook lu). Jadi cek subscription WABA + webhook, bukan tokennya.",
  },
  {
    q: "Bisa pakai nomor WhatsApp biasa?",
    a: "Nomor yang dipakai Cloud API punya ketentuan registrasi sendiri lewat platform WhatsApp Business. Kalau lu mau pakai nomor yang sekarang aktif di aplikasi WhatsApp, cek dulu status dan opsi migrasinya di Meta — jangan asal daftar ulang karena bisa ada konsekuensi.",
  },
  {
    q: "Apa dashboard ini membaca WhatsApp Web?",
    a: "Nggak. Dashboard ini pakai jalur resmi WhatsApp Cloud API dari Meta. Nggak ada scan QR, nggak ada Baileys, nggak ada scraping WhatsApp Web.",
  },
];

export default function TutorialPage() {
  const [mode, setMode] = useState<"pemula" | "lanjutan">("pemula");
  const [done, setDone] = useState<boolean[]>(() => CHECKLIST.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as boolean[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(arr) && arr.length === CHECKLIST.length) setDone(arr);
      }
    } catch {
      // localStorage tak tersedia — checklist jalan tanpa persist
    }
  }, []);

  const toggle = (i: number) => {
    setDone((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      try {
        // Hanya status checklist tutorial — TIDAK PERNAH credentials.
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // abaikan
      }
      return next;
    });
  };

  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  // Ceklis kotak di step → simpan + geser otomatis ke step berikut, lalu berhenti.
  const toggleStep = (i: number) => {
    const willCheck = !done[i];
    toggle(i);
    if (!willCheck) return;
    setTimeout(() => {
      const el = stepRefs.current[i + 1];
      if (el) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
    }, 150);
  };

  const doneCount = done.filter(Boolean).length;
  const pct = Math.round((doneCount / CHECKLIST.length) * 100);

  return (
    <>
      <Header title="Tutorial" subtitle="Panduan setup WhatsApp dari nol sampai nyambung" />
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {/* HERO */}
        <section className="card-hover overflow-hidden rounded-2xl border border-stone-soft bg-white dark:border-night-600 dark:bg-night-800">
          <div className="bg-brand-800 p-5 text-white sm:p-6">
            <h1 className="text-xl font-bold sm:text-2xl">Hubungkan WhatsApp ke Dashboard</h1>
            <p className="mt-2 text-sm text-brand-100">
              Belum pernah setup WhatsApp Cloud API? Santai. Kita jalanin satu-satu
              dari nol sampai WhatsApp lu benar-benar nyambung ke dashboard ini.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/15 px-3 py-1">Estimasi setup: ± 20–40 menit</span>
              <span className="rounded-full bg-white/15 px-3 py-1">Level: Pemula</span>
              <span className="rounded-full bg-white/15 px-3 py-1">Terakhir diverifikasi: September 2026</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4">
            <div className="flex gap-2" role="group" aria-label="Mode tutorial">
              {(["pemula", "lanjutan"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`btn-transition rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-600 ${
                    mode === m ? "bg-brand-800 text-white" : "bg-mist text-brand-900 hover:bg-stone-soft dark:bg-night-700 dark:text-night-100"
                  }`}
                >
                  {m === "pemula" ? "Mode Pemula" : "Mode Lanjutan"}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500 dark:text-night-400" aria-live="polite">{doneCount} / {CHECKLIST.length} selesai</span>
          </div>
          <div className="px-4 pb-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist dark:bg-night-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress tutorial">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </section>

        {/* STATUS LIVE */}
        <SetupStatusPanel />

        {/* CHECKLIST */}
        <section aria-label="Checklist setup" className="rounded-2xl border border-stone-soft bg-white p-5 dark:border-night-600 dark:bg-night-800">          <h2 className="text-sm font-bold text-brand-900 dark:text-night-100">Checklist — centang yang udah beres</h2>
          <ol className="mt-3 space-y-1.5">
            {CHECKLIST.map((label, i) => (
              <li key={label}>
                <label className="btn-transition flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-cream focus-within:outline-2 focus-within:outline-brand-600 dark:hover:bg-night-700">
                  <input
                    type="checkbox"
                    checked={done[i]}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 accent-green-700"
                  />
                  <span className="w-6 shrink-0 font-mono text-xs text-gray-400 dark:text-night-400">{String(i + 1).padStart(2, "0")}</span>
                  <span className={done[i] ? "text-gray-400 line-through dark:text-night-400" : "text-gray-800 dark:text-night-100"}>{label}</span>
                </label>
              </li>
            ))}
          </ol>
        </section>

        {/* STEPS */}
        <Step n="1" title="Siapkan akun Meta dulu" checked={done[0]} onToggle={() => toggleStep(0)} stepId={"tutorial-step-0"} stepRef={(el: HTMLElement | null) => { stepRefs.current[0] = el; }} mode={mode}>
          <p>Sebelum nyentuh dashboard ini, kita harus siapin tempat WhatsApp-nya dulu di Meta. Lu butuh:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>akun Meta</li>
            <li>Meta Business Portfolio (= rumah bisnis lu)</li>
            <li>WhatsApp Business Account / WABA (= akun WhatsApp bisnis di dalam rumah itu)</li>
            <li>nomor WhatsApp Business (= nomor yang nanti dipakai)</li>
            <li>Meta App (= aplikasi jembatan antara Meta dan dashboard ini)</li>
          </ul>
          <Callout kind="info">Jangan langsung bingung sama istilahnya. Yang penting lu ikutin urutannya satu-satu.</Callout>
        </Step>

        <Step n="2" title="Pahami dulu: WABA itu apa?" checked={done[1]} onToggle={() => toggleStep(1)} stepId={"tutorial-step-1"} stepRef={(el: HTMLElement | null) => { stepRefs.current[1] = el; }} mode={mode}>
          <p><b>WABA = WhatsApp Business Account.</b> Ini bukan sekadar aplikasi WhatsApp di HP — ini akun WhatsApp Business Platform yang dipakai API.</p>
          <p>WhatsApp biasa ≠ WhatsApp Business Platform / Cloud API. Dashboard ini menggunakan jalur resmi WhatsApp Cloud API dari Meta. Nggak ada baca-baca WhatsApp Web di sini.</p>
        </Step>

        <Step n="3" title="Siapkan nomor WhatsApp Business" checked={done[2]} onToggle={() => toggleStep(2)} stepId={"tutorial-step-2"} stepRef={(el: HTMLElement | null) => { stepRefs.current[2] = el; }} mode={mode}>
          <p><b>Nomor apa yang dipakai?</b> Lu butuh business phone number yang dipakai lewat Cloud API. Nomor yang dipakai Cloud API punya ketentuan tersendiri dan proses registrasinya dilakukan melalui platform WhatsApp Business.</p>
          <Callout kind="warn">Kalau lu mau pakai nomor yang sekarang sudah aktif di aplikasi WhatsApp, cek dulu status dan opsi migrasinya di Meta. Jangan asal daftar ulang nomor karena proses registrasi/migrasi nomor bisa punya konsekuensi.</Callout>
          <p><DocLink href={META_DOCS.waDocs}>Pelajari di dokumentasi resmi Meta</DocLink></p>
        </Step>

        <Step n="4" title="Buat / siapkan Meta App" checked={done[3]} onToggle={() => toggleStep(3)} stepId={"tutorial-step-3"} stepRef={(el: HTMLElement | null) => { stepRefs.current[3] = el; }} mode={mode}
          technical={<p>App ini yang pegang permission + webhook subscription. Pastikan App-nya nyambung ke WABA yang bener, bukan WABA lain kalau lu punya lebih dari satu.</p>}>
          <p>Sekarang kita butuh Meta App sebagai penghubung API:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Masuk ke Meta for Developers</li>
            <li>Buat atau pilih App</li>
            <li>Tambahkan produk WhatsApp</li>
            <li>Pastikan App terhubung ke WABA yang benar</li>
          </ol>
          <Callout kind="info">Nama menu Meta bisa berubah sedikit tergantung tampilan dashboard Meta saat ini. Yang dicari adalah bagian WhatsApp / WhatsApp Business Platform.</Callout>
          <p><DocLink href={META_DOCS.developers}>Meta for Developers</DocLink></p>
        </Step>

        <Step n="5" title="Ambil Access Token" checked={done[4]} onToggle={() => toggleStep(4)} stepId={"tutorial-step-4"} stepRef={(el: HTMLElement | null) => { stepRefs.current[4] = el; }} mode={mode}
          technical={<p>Token dipakai server-side sebagai Bearer header ke Graph API. Di dashboard ini token cuma transit dari form → backend → database terenkripsi, nggak pernah balik ke browser.</p>}>
          <p>Access Token itu ibarat <b>kunci</b> yang dipakai server dashboard buat bicara ke Meta. Jadi:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>jangan screenshot token</li>
            <li>jangan kirim token ke orang lain</li>
            <li>jangan masukin token ke frontend</li>
            <li>jangan taruh token di GitHub</li>
          </ul>
          <Callout kind="warn"><b>⚠️ JANGAN SHARE TOKEN.</b> Token ini rahasia. Kalau bocor, orang lain bisa mencoba mengakses API sesuai permission yang dimiliki token tersebut. Pakai token yang sesuai kebutuhan production dan ikuti mekanisme token resmi Meta.</Callout>
        </Step>

        <Step n="6" title="Cari WABA ID" checked={done[5]} onToggle={() => toggleStep(5)} stepId={"tutorial-step-5"} stepRef={(el: HTMLElement | null) => { stepRefs.current[5] = el; }} mode={mode}>
          <p><b>WABA ID = ID akun WhatsApp Business lu.</b></p>
          <p>🔎 Yang harus lu cari: <b>WABA ID</b>. Formatnya angka 15 digit, contoh dummy:</p>
          <CodeBlock value="123456789012345" label="123456789012345 (contoh — jangan copy ini)" />
          <Callout kind="warn">Angka di atas cuma contoh. Jangan copy contoh ini. Cari yang asli di dashboard Meta lu.</Callout>
        </Step>

        <Step n="7" title="Cari Phone Number ID (bukan nomor HP!)" checked={done[6]} onToggle={() => toggleStep(6)} stepId={"tutorial-step-6"} stepRef={(el: HTMLElement | null) => { stepRefs.current[6] = el; }} mode={mode}
          technical={<p>Dokumentasi Meta menunjukkan Phone Number ID dipakai buat identifikasi nomor yang terhubung ke WABA dan buat operasi API (termasuk health check <code>/{"{phone_number_id}"}?fields=...</code>).</p>}>
          <p>Ini yang paling sering ketuker. Perhatiin baik-baik:</p>
          <p>Nomor WhatsApp: <code className="rounded bg-mist px-1 dark:bg-night-700">+62 812-xxxx-xxxx</code><br />Phone Number ID: <code className="rounded bg-mist px-1 dark:bg-night-700">123456789012345</code></p>
          <Callout kind="warn"><b>⚠️ Jangan isi Phone Number ID dengan nomor WhatsApp.</b> Format contoh sama kayak di atas (dummy, jangan copy).</Callout>
        </Step>

        <Step n="8" title="Pahami Webhook (bel-nya Meta)" checked={done[7]} onToggle={() => toggleStep(7)} stepId={"tutorial-step-7"} stepRef={(el: HTMLElement | null) => { stepRefs.current[7] = el; }} mode={mode}
          technical={<p>Teknisnya: Meta kirim POST JSON ke endpoint lu dengan header <code>X-Hub-Signature-256</code> (HMAC-SHA256 dari raw body pakai App Secret). Dashboard ini verifikasi dulu baru proses — makanya App Secret wajib bener.</p>}>
          <p>Webhook itu kayak <b>bel</b>:</p>
          <div className="overflow-x-auto rounded-xl bg-brand-900 p-4 font-mono text-xs leading-6 text-brand-100" aria-label="Diagram alur webhook">
            Customer<br />&nbsp;&nbsp;↓<br />WhatsApp<br />&nbsp;&nbsp;↓<br />Meta Cloud API<br />&nbsp;&nbsp;↓<br />Webhook<br />&nbsp;&nbsp;↓<br />Server Dashboard<br />&nbsp;&nbsp;↓<br />PostgreSQL<br />&nbsp;&nbsp;↓<br />Dashboard CS
          </div>
          <p className="mt-2">Format webhook URL aplikasi ini:</p>
          <CodeBlock value="https://domain-lu.com/api/wa/webhook" />
          <p><code className="rounded bg-mist px-1 dark:bg-night-700">/api/wa/webhook</code> adalah endpoint webhook aplikasi ini. <code>localhost</code> nggak bisa dipakai langsung oleh Meta sebagai endpoint publik — buat development pakai HTTPS tunnel, buat production pakai domain HTTPS. Dokumentasi Meta mensyaratkan webhook server bisa dijangkau Meta via HTTPS dan aplikasi perlu subscribe ke WABA biar notifikasi kekirim.</p>
          <p><DocLink href={META_DOCS.webhooks}>Dokumentasi webhooks Meta</DocLink></p>
        </Step>

        <Step n="9" title="Verify Token vs Access Token vs App Secret" checked={done[8]} onToggle={() => toggleStep(8)} stepId={"tutorial-step-8"} stepRef={(el: HTMLElement | null) => { stepRefs.current[8] = el; }} mode={mode}>
          <p>Gampang ketuker, jadi hafalin bedanya:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Access Token</b> = kunci server buat bicara ke Meta</li>
            <li><b>Verify Token</b> = kode yang dipakai saat Meta ngecek webhook (lu yang bikin bebas)</li>
            <li><b>App Secret</b> = buat validasi keamanan webhook (jangan dimatiin HMAC-nya cuma biar webhook &quot;berhasil&quot;)</li>
          </ul>
          <p>Contoh dummy Verify Token (bikin sendiri yang lain):</p>
          <CodeBlock value="tutorial_verify_2026" label="tutorial_verify_2026 (contoh — buat value sendiri)" />
        </Step>

        <Step n="10" title="Subscribe App ke WABA (sering kelupaan!)" checked={done[9]} onToggle={() => toggleStep(9)} stepId={"tutorial-step-9"} stepRef={(el: HTMLElement | null) => { stepRefs.current[9] = el; }} mode={mode}>
          <p>Webhook lu bisa aja udah bener. Tapi kalau App belum subscribe ke WABA yang benar, event WhatsApp belum tentu masuk.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Pastikan App sudah terhubung ke WABA</li>
            <li>Cari pengaturan subscription WhatsApp</li>
            <li>Subscribe App ke WABA</li>
            <li>Pastikan event <code className="rounded bg-mist px-1 dark:bg-night-700">messages</code> aktif</li>
          </ol>
          <Callout kind="info">Meta mendokumentasikan bahwa App perlu disubscribe ke WABA agar webhook events buat nomor di akun tersebut dikirim ke endpoint yang udah dikonfigurasi.</Callout>
        </Step>

        <Step n="11" title="Masukin semuanya ke dashboard" checked={done[10]} onToggle={() => toggleStep(10)} stepId={"tutorial-step-10"} stepRef={(el: HTMLElement | null) => { stepRefs.current[10] = el; }} mode={mode}>
          <p>Buka <Link href="/settings" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Settings → WhatsApp Configuration</Link>, isi satu-satu:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-soft text-xs uppercase tracking-wide text-gray-500 dark:border-night-600 dark:text-night-400">
                  <th className="px-2 py-2">Field</th>
                  <th className="px-2 py-2">Fungsinya</th>
                  <th className="px-2 py-2">Bukan ini</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Access Token", "kunci API", "bukan password login"],
                  ["Phone Number ID", "ID nomor API", "bukan nomor HP"],
                  ["WABA ID", "ID akun WA Business", "bukan Phone Number ID"],
                  ["Verify Token", "verifikasi webhook", "bukan Access Token"],
                  ["App Secret", "validasi signature", "bukan password user"],
                ].map(([f, g, b]) => (
                  <tr key={f} className="border-b border-mist last:border-0 dark:border-night-600">
                    <td className="px-2 py-2 font-semibold">{f}</td>
                    <td className="px-2 py-2">{g}</td>
                    <td className="px-2 py-2 text-gray-500 dark:text-night-400">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Kesalahan yang sering terjadi: ketuker Phone Number ID sama nomor HP, copy contoh dummy dari tutorial (jangan!), dan field dikosongin tapi dikira kesimpen (kosong = pertahankan nilai lama).</p>
        </Step>

        <Step n="12" title="Test Connection + test webhook" checked={done[11]} onToggle={() => toggleStep(11)} stepId={"tutorial-step-11"} stepRef={(el: HTMLElement | null) => { stepRefs.current[11] = el; }} mode={mode}>
          <p>Buka <b>Settings → WhatsApp → Test Connection</b>.</p>
          <p>Kalau berhasil: ✅ Meta bisa dihubungi, ✅ credential terbaca, ✅ konfigurasi dasar aman.</p>
          <p>Kalau gagal, cek dulu:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Access Token benar?</li>
            <li>Phone Number ID benar?</li>
            <li>Token masih aktif?</li>
            <li>Permission sesuai?</li>
            <li>WABA dan nomor yang dipakai memang pasangan yang benar?</li>
          </ol>
          <p>Lanjut ceklist webhook: URL public? HTTPS aktif? Verify Token sama? App Secret benar? WABA sudah subscribe? <code className="rounded bg-mist px-1 dark:bg-night-700">messages</code> aktif? Kalau semua udah dicentang, lanjut test.</p>
        </Step>

        <Step n="13" title="Kirim pesan test + cek realtime + balas" checked={done[12]} onToggle={() => toggleStep(12)} stepId={"tutorial-step-12"} stepRef={(el: HTMLElement | null) => { stepRefs.current[12] = el; }} mode={mode}
          technical={<p>Detail teknis: pesan masuk tersimpan sebagai <code>direction = INBOUND</code> + interaksi <code>MESSAGE</code>; kota terdeteksi deterministik (bukan AI); balasan tersimpan <code>OUTBOUND</code> dengan lifecycle <code>SENDING → SENT → DELIVERED → READ</code>; feed realtime jalan via SSE + cursor.</p>}>
          <p>Sekarang test bagian paling penting. Dari nomor test, kirim:</p>
          <CodeBlock value="Halo, saya dari Bogor" />
          <p>Yang seharusnya lu lihat: customer baru + nama + nomor + <b>City = Bogor</b> + pesan + waktu. (City detection aplikasi bersifat deterministic — bukan AI yang nebak.)</p>
          <p>Terus balas dari dashboard: <b>Customers → pilih customer → Workspace → tulis pesan → Send</b>. Statusnya jalan <code className="rounded bg-mist px-1 dark:bg-night-700">SENDING → SENT → DELIVERED → READ</code> (atau <code className="rounded bg-mist px-1 dark:bg-night-700">FAILED</code> kalau gagal).</p>
          <p>Buka dashboard dan WhatsApp barengan, kirim pesan baru — pesannya seharusnya muncul tanpa refresh manual. Ini yang bikin dashboard terasa realtime.</p>
        </Step>

        {/* TROUBLESHOOTING */}
        <section aria-label="Troubleshooting" className="rounded-2xl border border-stone-soft bg-white p-5 dark:border-night-600 dark:bg-night-800">
          <h2 className="text-base font-bold text-brand-900 dark:text-night-100">Kalau gagal, cek sini</h2>
          <div className="mt-3 space-y-2">
            <Accordion title="A. Connection gagal">
              <ul className="list-disc space-y-1 pl-5">
                <li>Access Token salah / expired / invalid</li>
                <li>Phone Number ID salah</li>
                <li>WABA ID salah</li>
                <li>Permission bermasalah — tokennya punya akses WhatsApp yang diperlukan?</li>
              </ul>
            </Accordion>
            <Accordion title="B. Webhook verification gagal">
              <ul className="list-disc space-y-1 pl-5">
                <li>Verify Token beda antara Meta dan dashboard</li>
                <li>URL salah / typo <code>/api/wa/webhook</code></li>
                <li>Endpoint nggak public (masih localhost tanpa tunnel)</li>
                <li>HTTPS bermasalah</li>
              </ul>
            </Accordion>
            <Accordion title="C. Webhook verified tapi pesan nggak masuk">
              <ul className="list-disc space-y-1 pl-5">
                <li>App belum subscribe ke WABA yang benar</li>
                <li>Event <code>messages</code> belum aktif</li>
                <li>Nomor pengirim bukan nomor yang terhubung</li>
                <li>URL publik berubah (tunnel restart?) — update Callback URL</li>
              </ul>
            </Accordion>
            <Accordion title="D. Bisa menerima tapi nggak bisa membalas">
              <ul className="list-disc space-y-1 pl-5">
                <li>Access Token / Phone Number ID bermasalah</li>
                <li>Messaging permission kurang</li>
                <li>Setup nomor test/recipient belum bener</li>
                <li>Kalau dashboard bilang gagal, pesannya dibaca baik-baik (bukan tokennya yang dilihat)</li>
              </ul>
            </Accordion>
            <Accordion title="E. Pesan masuk tapi nggak realtime">
              <ul className="list-disc space-y-1 pl-5">
                <li>Lihat indikator Live di halaman WhatsApp — lagi reconnect?</li>
                <li>Cek tab Network browser waktu buka halaman</li>
                <li>Refresh sekali, terus kirim pesan lagi buat mastiin</li>
              </ul>
            </Accordion>
            <Accordion title="F. Status nggak berubah (mentok SENT)">
              <ul className="list-disc space-y-1 pl-5">
                <li>Event status dari Meta belum masuk (butuh subscription + pesan dibaca penerima)</li>
                <li>Pastikan message ID-nya cocok (bukan pesan lain)</li>
                <li>Refresh halaman — status terbaru selalu dibaca dari database</li>
              </ul>
            </Accordion>
          </div>
        </section>

        {/* ERROR TRANSLATION */}
        <section aria-label="Arti error" className="rounded-2xl border border-stone-soft bg-white p-5 dark:border-night-600 dark:bg-night-800">
          <h2 className="text-base font-bold text-brand-900 dark:text-night-100">Kalau dashboard ngomong gini, artinya...</h2>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ["Token Meta tidak bisa digunakan.", "Coba cek apakah Access Token masih aktif dan punya permission WhatsApp yang diperlukan."],
              ["WhatsApp is not configured", "Kredensial belum lengkap. Balik ke Settings → WhatsApp Configuration, isi yang kurang, Save, Test Connection."],
              ["Pesan gagal dikirim. Coba lagi.", "Meta nolak pesannya. Cek nomor tujuan + konfigurasi, terus coba sekali lagi. Jangan spam klik."],
              ["Pengiriman belum dapat dikonfirmasi.", "Jaringan/timeout — pesannya MUNGKIN udah kekirim. Jangan kirim ulang membabi buta, tunggu statusnya dulu."],
            ].map(([err, artinya]) => (
              <div key={err} className="rounded-xl bg-cream p-3 dark:bg-night-700">
                <p className="font-semibold text-brand-900 dark:text-night-100">“{err}”</p>
                <p className="mt-1 text-gray-700 dark:text-night-100">{artinya}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section aria-label="FAQ" className="rounded-2xl border border-stone-soft bg-white p-5 dark:border-night-600 dark:bg-night-800">
          <h2 className="text-base font-bold text-brand-900 dark:text-night-100">FAQ</h2>
          <div className="mt-3 space-y-2">
            {FAQS.map((f) => (
              <Accordion key={f.q} title={f.q}>
                <p>{f.a}</p>
              </Accordion>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
