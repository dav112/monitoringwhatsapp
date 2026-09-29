# Monitoring WhatsApp — Customer Dashboard

Aplikasi monitoring WhatsApp CS: dashboard, customer workspace + conversation,
outbound reply, lifecycle status pesan, export Excel, backup/retention.
Stack: Next.js (App Router) + TypeScript + Tailwind + PostgreSQL + Prisma,
auth session sealed-cookie + RBAC (ADMIN/SUPERVISOR/CS).

## 1. Install dependency

```bash
npm install
```

## 2. Buat .env

```bash
cp .env.example .env
```

Isi `DATABASE_URL`:

```env
# Lokal (podman/docker)
DATABASE_URL="postgresql://wa:wa_dev_password@localhost:5432/monitoring_whatsapp"
# Supabase (contoh)
# DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

Jangan hardcode credential — selalu lewat environment variable.

## 3. Menjalankan PostgreSQL lokal (podman)

```bash
podman run -d --name wa-postgres \
  -e POSTGRES_USER=wa \
  -e POSTGRES_PASSWORD=wa_dev_password \
  -e POSTGRES_DB=monitoring_whatsapp \
  -p 5432:5432 docker.io/library/postgres:16-alpine
```

Alternatif docker: ganti `podman` dengan `docker`. Atau pakai Supabase dan isi `DATABASE_URL` dengan connection string-nya.

## 4. Prisma migration

```bash
npx prisma migrate dev   # buat + jalankan migration (dev)
npx prisma migrate deploy # jalankan migration yg sudah ada (prod)
npx prisma generate      # regenerate Prisma Client
```

## 5. Seed database

```bash
npx prisma db seed
```

Seed bersifat idempotent (upsert): aman dijalankan ulang. Isi: 14 customers dummy (nomor `62810/62811/62812...` jelas data dev), 3 users (`admin@example.local`, `supervisor@example.local`, `cs@example.local`, password `password123` di-hash bcrypt), 6 settings default.

> ⚠️ **Seed credentials are development-only and must be changed before production.**
> Password seed (`password123`) hanya untuk dev. Buat user produksi baru dan
> nonaktifkan/hapus akun seed sebelum go-live.

## 6. Prisma Studio

```bash
npx prisma studio
```

## 7. Development server

```bash
npm run dev    # http://localhost:3000
npm run lint
npm run build
```

Workflow lengkap dari nol:

```bash
npm install
cp .env.example .env   # lalu isi DATABASE_URL
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## API (Step 2)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/customers?search=&city=&status=&page=&limit=&sort=` | List + pagination `{ data, pagination }` |
| GET | `/api/customers/[id]` | Detail + 50 interaksi terakhir |
| PATCH | `/api/customers/[id]` | Update `name/phone/city/status` (whitelist). Perubahan status → `CustomerInteraction` `STATUS_CHANGED` |
| DELETE | `/api/customers/[id]` | Hapus (interactions cascade, messages set-null) |
| GET | `/api/dashboard` | `totalCustomers, customersToday/ThisWeek/ThisMonth, customersByCity, recentCustomers, growth14d` |
| GET | `/api/users` | Tanpa `passwordHash` |
| GET/PATCH | `/api/settings` | GET `{ data: { key: value } }`, PATCH `{ key, value }` atau `{ values }` |

Status customer di database: `NEW` (Baru), `FOLLOW_UP` (Follow Up), `COMPLETED` (Selesai).

## WhatsApp Cloud API (Step 3)

Hanya webhook resmi Meta — tanpa Baileys/scraping, tanpa auto-reply, tanpa realtime.

### 1. Isi credential (.env, jangan di-commit)

```env
WHATSAPP_ACCESS_TOKEN=        # token Graph API (server saja, tidak ke frontend)
WHATSAPP_PHONE_NUMBER_ID=     # ID nomor bisnis
WHATSAPP_BUSINESS_ACCOUNT_ID= # opsional
WHATSAPP_VERIFY_TOKEN=        # token verifikasi webhook (bebas, samakan dengan isian di Meta)
WHATSAPP_APP_SECRET=          # app secret (validasi X-Hub-Signature-256)
```

Kosong = belum terkonfigurasi; `/api/wa/status` tetap jalan dan melaporkan `configured: false`.

### 2. Endpoint

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/wa/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` | Verifikasi Meta → balas `hub.challenge` (200) atau 403 |
| POST | `/api/wa/webhook` | Event inbound. Validasi HMAC SHA-256 atas **raw body** bila `APP_SECRET` diset. Selalu `{ success: true }` untuk event valid |
| GET | `/api/wa/status` | Aman untuk frontend: `configured`, `phoneNumberConfigured`, `webhookConfigured`, `appSecretConfigured`, `apiReachable` (health check Graph API, cache 60 dtk), `displayPhoneNumber`, `verifiedName`, `totalInbound`, `lastMessage`. **Tanpa token/secret** |

Alur inbound per pesan (satu transaksi Prisma): normalisasi nomor → cari/buat customer (baru = `NEW`, nama tidak di-overwrite bila kosong) → simpan `WhatsAppMessage` INBOUND (`messageId` unique cegah duplikat, termasuk race via P2002) → interaksi `MESSAGE` → deteksi kota deterministik → bila ketemu: update `city` + interaksi `CITY_DETECTED`.

### 3. Uji lokal tanpa API Meta

```bash
npm run test:wa                       # 23 unit test: city detector, phone, signature, parse
# Verifikasi webhook (server dev jalan):
curl "http://localhost:3000/api/wa/webhook?hub.mode=subscribe&hub.verify_token=ISI_SESUAI_ENV&hub.challenge=HELLO"
# Kirim mock inbound (APP_SECRET kosong → signature dilewati):
curl -X POST http://localhost:3000/api/wa/webhook \
  -H "Content-Type: application/json" \
  --data-binary @scripts/mock-webhook-text.json
# Dengan APP_SECRET: hitung dulu
python3 -c "import hmac,hashlib;raw=open('scripts/mock-webhook-text.json','rb').read();print('sha256='+hmac.new(b'ISI_SECRET',raw,hashlib.sha256).hexdigest()))"
curl -X POST http://localhost:3000/api/wa/webhook \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: HASIL_DI_ATAS" \
  --data-binary @scripts/mock-webhook-text.json
```

PENTING: pakai `--data-binary` (curl `--data` mengubah newline → signature gagal).

### 4. Checklist setup Meta (wajib manual di dashboard Meta)

#### A. Meta Developer App
1. Buka [developers.facebook.com](https://developers.facebook.com) → login → **Create App**.
2. Pilih tipe **Business** (atau Other → Business), isi nama app → Create.

#### B. Aktifkan WhatsApp Business Platform
1. Di App Dashboard → **Add Product** → **WhatsApp** → Set up.
2. Selesaikan onboarding: pilih/buat Meta Business Account, buat atau klaim nomor. Untuk uji coba, Meta menyediakan **nomor test** + batas 5 nomor penerima (tambahkan di *API Setup* → *To*).
3. Catat dari halaman **API Setup**: *Temporary access token* (24 jam, untuk test), *Phone number ID*, *WhatsApp Business Account ID*. Untuk produksi buat *System User* + token permanen di Business Settings.
4. Ambil **App secret** dari App Dashboard → *App settings* → *Basic* → *App secret* (klik Show).

#### C. Credential — fungsi masing-masing (JANGAN taruh nilai asli di README/repo)

| Variable | Fungsi |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Bearer token untuk health check Graph API (server saja) |
| `WHATSAPP_PHONE_NUMBER_ID` | ID nomor bisnis pengirim (target health check) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID akun bisnis (info/opsional, belum dipakai kode) |
| `WHATSAPP_VERIFY_TOKEN` | String rahasia BEBAS buatanmu; harus SAMA dengan isian Verify Token di Meta |
| `WHATSAPP_APP_SECRET` | Kunci HMAC untuk validasi `X-Hub-Signature-256` |

Cek cepat (tidak menampilkan nilai secret): `npm run wa:check`.

#### D. Webhook — Callback URL
1. Jalankan app + tunnel (lihat bagian 5) hingga dapat URL publik, mis. `https://xxxxx.trycloudflare.com`.
2. Callback URL = `https://xxxxx.trycloudflare.com/api/wa/webhook`. JANGAN pakai `http://localhost...` — Meta menolak non-HTTPS/non-publik.
3. Meta App Dashboard → **WhatsApp → Configuration** → *Callback URL* + *Verify token* (= isi `WHATSAPP_VERIFY_TOKEN`) → **Verify and Save**. Meta memanggil `GET /api/wa/webhook?hub.mode=subscribe&...`; sukses = dialog tertutup tanpa error.

#### E. Subscribe event `messages`
Di panel *Webhook fields* (halaman Configuration yang sama) → **Subscribe** pada field **`messages`**. Tanpa ini Meta tidak mengirim pesan masuk.

#### F. Testing pesan asli → database
1. Kirim pesan WA ke nomor bisnis dari HP (nomor penerima test harus terdaftar bila pakai nomor trial).
2. Cek log server: `[WhatsApp] Webhook diterima.` → `[WhatsApp] Pesan masuk: ...`.
3. Verifikasi DB: `npx prisma studio` (tabel `customers`, `whatsapp_messages`, `customer_interactions`) atau buka halaman `/customers`, `/dashboard`, `/whatsapp`.
4. Kirim ulang payload yang sama → pastikan tidak ada record ganda (idempotency via `messageId`).

### 5. Public HTTPS tunnel untuk development lokal

Meta mewajibkan Callback URL berupa **HTTPS publik**. Jalankan Next.js lokal + tunnel:

```bash
npm run dev                                   # http://localhost:3000
cloudflared tunnel --url http://localhost:3000   # prioritas: Cloudflare Tunnel
# alternatif: ngrok http 3000
```

Hasil contoh: `https://xxxxx.trycloudflare.com` → Callback URL = `https://xxxxx.trycloudflare.com/api/wa/webhook`. Jangan menyimpan credential/URL tunnel di repository (URL trycloudflare berubah tiap run — update Callback URL di Meta setiap ganti).

### 6. WhatsApp Configuration via Settings (tanpa edit .env)

Buka `/settings` → kartu **WhatsApp API Configuration** (hanya ADMIN).

1. Isi field: **Access Token** (secret), **Phone Number ID** (angka), **Business Account ID** (angka, opsional), **Verify Token** (secret), **App Secret** (secret). Secret memakai input password + Show/Hide dan tidak pernah ditampilkan kembali (hanya badge `Configured ✓`).
2. Klik **Simpan Konfigurasi**. Field secret yang dikosongkan = pertahankan nilai lama; hapus hanya via tombol **Clear** + konfirmasi.
3. Klik **Test Connection** untuk health check server-side ke Graph API (`✓ reachable` / `✕ could not be reached`) — token tidak ke frontend.
4. Prioritas credential: **database → fallback .env**. Webhook (`GET/POST /api/wa/webhook`) dan `/api/wa/status` otomatis memakai nilai efektif.
5. Secret disimpan terenkripsi **AES-256-GCM** di tabel `whatsapp_config` (satu baris `id="global"`). Master key dari `WHATSAPP_CONFIG_ENCRYPTION_KEY` (`openssl rand -hex 32`) — wajib aman, tidak ke repo/frontend/log; ganti dengan nilai baru untuk produksi.
6. Proteksi role aktif penuh (session nyata): tanpa flag dev. UI pengubah dibatasi ADMIN;
semua role terautentikasi boleh melihat status boolean.

## Authentication & Roles

Login nyata di `/login` (email + password, bcrypt vs `passwordHash`).
Sesi: sealed cookie `wa_session` (iron-session) — HttpOnly, Secure di produksi,
SameSite=Lax, expired 8 jam. Tanpa token di localStorage. Payload hanya
`userId/role/name/email`. `lastActiveAt` diupdate saat login sukses.

| Area | ADMIN | SUPERVISOR | CS |
|---|---|---|---|
| dashboard, customers, whatsapp, export | ✓ | ✓ | ✓ |
| settings (operasional) | ✓ | ✓ | — |
| WhatsApp API config + Test Connection + Clear | ✓ | — | — |
| users (lihat + activate/deactivate) | ✓ | — | — |

API tanpa session → 401; role kurang → 403. Pengecualian: `/api/wa/webhook`
tetap publik (HMAC signature). Mutasi berauth dicek same-origin + rate limit
login (10x/10 mnt per IP+email, in-memory single-instance).
Dev bypass (`WA_CONFIG_ALLOW_UNAUTHENTICATED` / `ALLOW_DEV_ROLE_HEADER`) sudah
DIHAPUS total — tidak ada referensi di kode/env. Secret produksi: `AUTH_SECRET`
dan `WHATSAPP_CONFIG_ENCRYPTION_KEY` wajib acak (`openssl rand -hex 32`).

### 7. Excel Export

Halaman `/export` mengekspor **seluruh** customer sesuai filter ke `.xlsx` (bukan
hanya halaman pagination). Endpoint: `GET /api/export/customers` (file) dan
`GET /api/export/customers/count` (jumlah untuk UI). Role: **ADMIN & SUPERVISOR**;
CS → 403, anonim → 401. Halaman `/export` juga dibatasi ADMIN/SUPERVISOR di proxy.

Filter: search (nama/nomor), city, status (`NEW/FOLLOW_UP/COMPLETED`), date range
atas `createdAt` (inklusif penuh per hari WIB: `startDate` `YYYY-MM-DD` s/d
`endDate` 23:59:59 WIB; `startDate <= endDate`, selain itu 400).

Kolom: Nama, Nomor WhatsApp (string `@`, anti scientific-notation), Kota, Status
(label Indonesia), Tanggal Dibuat/Diperbarui (waktu WIB, format Excel). Header
bold + freeze baris 1 + autofilter + lebar kolom wajar. Worksheet `Customers`.
Filename `customers-YYYYMMDD-HHmmss.xlsx` (WIB). Filter kosong → 404 dengan pesan
ramah (tombol disabled saat total 0). Hanya kolom operasional — tanpa
passwordHash/token/secret.

Dataset besar: baca DB per batch 1000 (env `EXPORT_BATCH_SIZE`, clamp 100–5000)
dengan **keyset** `(createdAt DESC, id DESC)` — ordering deterministik, stabil,
memakai index `createdAt`, tanpa OFFSET mahal. Penulis `exceljs` streaming
(`WorkbookWriter`): baris di-commit per batch, satu batch di memory, tanpa file
temp, tanpa state global (aman untuk export paralel). Test:

```bash
npm run test:export   # 11 test: auth matrix, filter, 404, batching, isi xlsx, paralel
```

### 8. Realtime WhatsApp Monitoring

Halaman `/whatsapp` menampilkan pesan masuk **tanpa refresh manual**.

Arsitektur (dipilih **SSE push + cursor catch-up**, bukan WebSocket/polling):
`POST /api/wa/webhook` → simpan DB → emit bus in-memory → `GET
/api/wa/messages/stream` (SSE) → feed prepend. Alasan: deployment single-instance
Next.js tanpa service tambahan (Redis/Kafka dilarang scope); writes jarang dan
webhook-driven; SSE native browser (auto-reconnect) dan cookie session terkirim
otomatis; tiap koneksi TIDAK polling DB (hanya initial + catch-up). Polling
ditolak agar DB tak terbebani per interval per tab; WebSocket custom ditolak
karena butuh server terpisah tanpa alasan teknis.

Endpoint: `GET /api/wa/messages?limit=&after=&before=&customerId=&direction=`
(default inbound, limit 30, maks 100; keyset `createdAt DESC, id DESC` via index
`direction+createdAt+id`; `after`/`before` = cursor base64url `ISO|id`) dan
`GET /api/wa/messages/stream` (event `connected`, `message`, heartbeat 25 dtk,
cleanup saat disconnect). Auth: session, semua role read-only; webhook tetap
publik + HMAC. Respons hanya field operasional + customer ringkas.

UI: status Live/Menghubungkan/Menghubungkan ulang/Jeda (teks, bukan warna saja);
pil "N pesan baru" bila scroll ke atas (tanpa auto-scroll agresif); tombol "Muat
pesan lebih lama" (cursor); grouping header customer berurutan; dedupe by id;
catch-up via cursor saat tab kembali aktif (EventSource ditutup saat hidden);
tanpa suara/notifikasi browser. Test: `npm run test:realtime` (12 test).

Limitasi jujur: bus in-memory = single-instance; multi-instance butuh pub/sub
eksternal. Logout tidak mencabut cookie yang sudah diterbitkan (TTL 8 jam);
penonaktifan user langsung efektif via cek ACTIVE.

### 9. Production Hardening

Checklist sebelum go-live (verifikasi dengan `npm run wa:check`):

1. **Secrets**: `AUTH_SECRET` + `WHATSAPP_CONFIG_ENCRYPTION_KEY` acak 32-byte
   (`openssl rand -hex 32`), bukan nilai lemah/default. Seed `password123`
   DEV-only — buat admin produksi baru, nonaktifkan akun seed. Kredensial Meta
   via UI Settings (terenkripsi AES-256-GCM), bukan `.env` yang di-commit.
2. **Database**: `prisma migrate deploy` (JANGAN `migrate reset` di produksi),
   volume persisten, backup reguler + prosedur restore (infrastruktur — belum
   otomatis di repo ini). Tidak ada retention/deletion job otomatis.
3. **Auth**: cookie HttpOnly + Secure (prod) + SameSite=Lax, TTL 8 jam;
   `requireAuth` cek ACTIVE tiap API; rate limit login 10x/10 mnt (in-memory,
   single-instance; multi-instance butuh store terpusat).
4. **Webhook**: HMAC raw-body + 403/400/500 yang memungkinkan retry Meta yang
   aman (idempotency via `messageId` unique + transaksi). SSE emit best-effort.
5. **Realtime**: bus in-memory = single-instance (multi-instance butuh pub/sub).
6. **Lainnya**: security headers (nosniff/DENY/referrer/permissions) aktif;
   health publik `GET /api/health` (tanpa secret, tanpa Graph call); error
   response generik; log tanpa secret/PII berlebih (hanya ID/tipe/hasil).

### 10. Customer & Conversation Workspace

Route `/customers/[id]` (read-only, tanpa pengiriman pesan): kolom profil
(nama, nomor string, kota, status, created/updated) + timeline aktivitas
(MESSAGE/CITY_DETECTED/STATUS_CHANGED/NOTE, tanpa ID internal) + conversation
berupa bubbles (INBOUND kiri, OUTBOUND kanan, label tipe non-text, timestamp
WIB `HH.MM`/`Kemarin`/tanggal). Pagination keyset via `GET /api/wa/messages`
(`customerId`, `direction=all`, limit 30, cursor `before`; index
`customerId+createdAt+id` aman untuk ribuan pesan). Realtime memakai SSE Step 6
yang sama (filter `customerId`, dedupe by id, catch-up saat tab kembali).
Akses: session, ADMIN/SUPERVISOR/CS; 404 bila tak ada. Test:
`npm run test:workspace` (8 test). Limitasi: tanpa composer/reply, tanpa
media viewer, tanpa notes CRUD.

### 11. CS Reply / Outbound WhatsApp

Composer di bawah conversation `/customers/[id]` (text only, Enter kirim /
Shift+Enter baris baru, tombol Send, state Sending, error + Retry, input
dipertahankan bila gagal, dikosongkan bila sukses; teks dirender plain,
newline via `whitespace-pre-wrap`).

Endpoint: `POST /api/customers/[id]/messages` `{content, clientMessageId?}`
— auth semua role + same-origin; phone SELALU dari database (body `phone`/
`direction`/`messageId` diabaikan); validasi kosong/whitespace/maks
4096 char; rate limit 30/menit per user+customer; tanpa kredensial → 503 aman.

Flow: validasi → cek config → klaim `clientMessageId` (placeholder unik
SEBELUM panggil Meta; balapan → 1 kirim) → Graph API (timeout 10 dtk) →
transaksi (messageId Meta + interaksi MESSAGE) → emit SSE → 201. Meta 4xx
definitif → placeholder dihapus (retry bersih); timeout/retryable → placeholder
dipertahankan (retry key sama → 409 "belum dapat dikonfirmasi", tanpa resend
otomatis). Retry aman: SELALU pakai key yang sama per submisi; key baru hanya
setelah sukses. Tanpa auto status-change, tanpa media/template/bulk.
Test: `npm run test:outbound` (16 test, Graph API di-mock; real Meta E2E
terpisah dan NOT RUN tanpa kredensial).

### 12. WhatsApp Message Delivery Status

Lifecycle OUTBOUND: `SENDING → SENT → DELIVERED → READ` (atau `→ FAILED`).
Inbound `status = NULL` (tanpa lifecycle; `updatedAt` berubah tiap transisi
sehingga timestamp per-status tak diperlukan).

Webhook `statuses[]` (id + status + timestamp + errors) diproses di endpoint
`/api/wa/webhook` yang sama — terpisah dari `messages[]`, HMAC tetap wajib.
Mapping by `messageId` (unique); unknown ID/status → 200 diabaikan; bukan
OUTBOUND → diabaikan; tanpa downgrade (out-of-order aman); FAILED terminal;
duplikat idempoten; TANPA interaction baru. Error Meta aman disimpan di
`statusDetail` (kode + ≤200 char).

Realtime: event `message_status` `{type, messageId, customerId, status}` via
SSE existing → bubble yang sama diupdate (tanpa bubble baru); reconnect
mengambil status terbaru dari DB. Bubble: `✓ Sent`, `✓✓ Delivered`,
`✓✓ Read`, `⚠ Failed` (+ teks, bukan warna saja). Response POST outbound dan
GET messages menyertakan `status` (kompatibel). Test:
`npm run test:message-status` (10 test). Real Meta E2E: NOT RUN (tanpa
kredensial). Limitasi: tanpa webhook `sent` terpisah (POST 201 = SENT),
tanpa analitik delivery.

## 13. Production Runbook

### Initial setup
```bash
npm install
cp .env.example .env   # isi DATABASE_URL, AUTH_SECRET, WHATSAPP_CONFIG_ENCRYPTION_KEY (openssl rand -hex 32)
npx prisma migrate deploy
# JANGAN seed di produksi (ditolak kecuali ALLOW_PROD_SEED=true).
# Buat admin produksi via Prisma Studio/psql dengan password bcrypt baru,
# lalu nonaktifkan/hapus akun seed.
npm run build && npm start   # atau npm run dev untuk development
```

### Backup / verify / restore
```bash
npm run db:backup                              # → backups/<db>_YYYY-MM-DD_HHMMSS.dump
npm run db:verify-backup -- backups/xxx.dump   # validasi tanpa restore penuh
echo RESTORE | npm run db:restore -- backups/xxx.dump   # konfirmasi wajib; pre-backup otomatis
```

### Retention (default disabled, dry-run dulu)
```bash
npm run data:retention              # DRY RUN + hitungan (aman)
npm run data:retention -- --apply   # HAPUS permanen: pesan & interaksi lama saja
```
`DATA_RETENTION_DAYS=0` = mati. Tidak pernah menghapus Customer/User/settings.
Deletion irreversible — backup dulu.

### Health
`GET /api/health` publik → `{status, database, whatsapp, env-flags}` (tanpa
secret). 200 = healthy, 503 = dependency down.

### Rotasi secret
- **AUTH_SECRET**: generate baru → semua session lama invalid (login ulang).
  Lakukan di jam sepi; tidak ada migrasi data.
- **WHATSAPP_CONFIG_ENCRYPTION_KEY**: KRITIS — mengganti key membuat kredensial
  terenkripsi lama tidak bisa didecrypt (status jadi unconfigured). Prosedur
  aman: catat kredensial, ganti key, masukkan ulang via Settings, Test
  Connection. Tidak ada rotasi otomatis/dual-key di step ini (limitation).
- **Kredensial Meta**: ganti via Settings → Test Connection; tanpa restart.

### Security checklist
AUTH_SECRET + encryption key acak & tidak di repo; seed password diganti;
HTTPS + webhook URL publik; backup terjadwal di infrastruktur; log tanpa
secret/PII; `X-Frame-Options: DENY` + nosniff aktif.

## 14. Deployment

### Development
```bash
npm run dev   # http://localhost:3000
```

### Production
```bash
npm run build
npm start                      # butuh NODE_ENV=production + env lengkap
```

### Database
```bash
npx prisma migrate deploy      # JANGAN migrate dev/reset/seed di produksi
```

### Health
`GET /api/health` → `{status, database, whatsapp}` (200/503, tanpa secret).

### Meta webhook
`https://domain/api/wa/webhook` (HTTPS publik; dev boleh tunnel). Verify token
= `WHATSAPP_VERIFY_TOKEN`; subscribe field `messages`.

### Required environment (tanpa nilai — lihat .env.example)
`DATABASE_URL, AUTH_SECRET, WHATSAPP_CONFIG_ENCRYPTION_KEY, DATA_RETENTION_DAYS`
+ kredensial WA (`ACCESS_TOKEN, PHONE_NUMBER_ID, BUSINESS_ACCOUNT_ID,
VERIFY_TOKEN, APP_SECRET`) atau via Settings (terenkripsi).

### Meta setup
Business Portfolio → WABA → Business Phone → Meta App → produk WhatsApp →
token + Phone Number ID + WABA ID → webhook + subscription `messages`.
Real send test terkunci `META_E2E_ENABLE_SEND=true` + `META_E2E_TEST_RECIPIENT`
(`npm run test:meta-e2e`; default SKIPPED tanpa kredensial).

### Architecture limitation
SSE event bus + rate limiter = in-memory → deployment awal single-instance
(Node.js, SSE long-lived OK, Postgres, env vars). Multi-instance butuh pub/sub
dan rate-limit terpusat (di luar scope).

### 15. Architecture

```text
Browser (dashboard/workspace, SSE, cookie session)
  ↓ HTTPS
Next.js (proxy RBAC → Server Components/API → iron-session + Prisma singleton)
  ↓                    ↓                      ↓
PostgreSQL      Meta Graph API (server-side)  SSE bus in-memory
```

Alur pesan: Meta webhook (HMAC) → transaksi (customer/pesan/interaksi) →
emit SSE → feed/workspace; outbound: composer → API → Graph API → Meta ID →
transaksi → SSE; status webhook → transisi guarded → SSE `message_status`.

### 16. Release Checklist

```text
[ ] All pages audited (login/dashboard/customers/workspace/whatsapp/export/settings/users)
[ ] All API routes audited (401/403, validasi, error generik)
[ ] Auth verified (login/logout/expiry/inactive/rate-limit)
[ ] RBAC verified (ADMIN/SUPERVISOR/CS + nav + API matrix)
[ ] Customer flow verified (CRUD, filter, pagination)
[ ] Workspace verified (profile/conversation/activity/realtime/composer)
[ ] Inbound verified (mock webhook; real = NOT TESTED)
[ ] Outbound verified (mock Graph API; real = NOT TESTED)
[ ] Delivery lifecycle verified (mock statuses; real = NOT TESTED)
[ ] Realtime verified (SSE, reconnect, catch-up, dedupe)
[ ] Export verified (filter, xlsx, batching)
[ ] Backup verified (backup + verify + restore round-trip)
[ ] Restore procedure verified (konfirmasi + pre-backup)
[ ] Secret leak audit PASS (repo/response/log)
[ ] XSS audit PASS (React text, tanpa dangerouslySetInnerHTML)
[ ] API security PASS (mutation matrix)
[ ] Responsive QA PASS (pola existing; tanpa overflow table)
[ ] Accessibility QA PASS (label, focus, aria, reduced-motion)
[ ] Browser console clean (prod server, tanpa hydration/exception error)
[ ] Prisma migrations up to date
[ ] Production build PASS + Lint PASS + Regression PASS
[ ] Real Meta E2E status documented (NOT TESTED)
[ ] Deployment status documented (NOT DEPLOYED)
```

### 17. Yang masih mock / belum dikerjakan

- `src/data/mock/whatsapp.ts` → tidak dipakai lagi (halaman `/whatsapp` pakai `/api/wa/status`)
- Realtime/websocket/SSE/polling, AI, auto-reply/chatbot, inbox penuh → di luar scope
