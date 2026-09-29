/**
 * Uji Excel Export Step 5 (DB asli, login nyata).
 * USE: npm run test:export
 */
import "dotenv/config";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

process.env.EXPORT_BATCH_SIZE = "5"; // paksa multi-batch agar path chunking teruji

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`, e);
    process.exitCode = 1;
  }
}

const ADMIN = { email: "admin@example.local", password: "password123" };
const SUPERVISOR = { email: "supervisor@example.local", password: "password123" };
const CS = { email: "cs@example.local", password: "password123" };

async function main() {
  const { GET: exportXlsx } = await import("../src/app/api/export/customers/route");
  const { GET: exportCount } = await import("../src/app/api/export/customers/count/route");
  const { POST: login } = await import("../src/app/api/auth/login/route");
  const { iterateCustomerBatches, EXPORT_COLUMNS } = await import("../src/lib/export/excel");
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");

  async function cookieOf(email: string, password: string): Promise<string> {
    const res = await login(
      new NextRequest("http://test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    assert.equal(res.status, 200, `login ${email} gagal`);
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
  const admin = await cookieOf(ADMIN.email, ADMIN.password);
  const supervisor = await cookieOf(SUPERVISOR.email, SUPERVISOR.password);
  const cs = await cookieOf(CS.email, CS.password);

  const get = (path: string, cookie?: string) =>
    new NextRequest(`http://test${path}`, { headers: cookie ? { cookie } : {} });

  async function loadWorkbook(res: Response): Promise<ExcelJS.Workbook> {
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(Readable.from(buf));
    return wb;
  }

  function rowValues(row: ExcelJS.Row): unknown[] {
    const v = row.values;
    assert.ok(Array.isArray(v), "row values harus array");
    return (v as unknown[]).slice(1);
  }

  // --- data temp terisolasi ---
  const stamp = Date.now();
  const temps = Array.from({ length: 12 }, (_, i) => ({
    name: `ExportProbe ${stamp} ${i}`,
    phone: `62899000${stamp % 100000}${String(i).padStart(2, "0")}`,
    city: i === 0 ? null : "ExportCity",
    status: "NEW" as const,
    createdAt: new Date("2025-01-15T10:00:00+07:00"),
  }));
  for (const t of temps) {
    await prisma.customer.create({ data: t });
  }
  const probeSearch = `ExportProbe ${stamp}`;

  // --- auth matrix ---
  await check("anon count → 401, anon export → 401", async () => {
    assert.equal((await exportCount(get("/api/export/customers/count"))).status, 401);
    assert.equal((await exportXlsx(get("/api/export/customers"))).status, 401);
  });
  await check("CS count → 403, CS export → 403", async () => {
    assert.equal((await exportCount(get("/api/export/customers/count", cs))).status, 403);
    assert.equal((await exportXlsx(get("/api/export/customers", cs))).status, 403);
  });
  await check("SUPERVISOR boleh count + export", async () => {
    assert.equal((await exportCount(get("/api/export/customers/count", supervisor))).status, 200);
    const r = await exportXlsx(get("/api/export/customers", supervisor));
    assert.equal(r.status, 200);
    await r.arrayBuffer();
  });

  // --- filter ---
  await check("filter search/city/status/date bekerja", async () => {
    const q = new URLSearchParams({
      search: probeSearch,
      city: "ExportCity",
      status: "NEW",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    const res = await exportCount(get(`/api/export/customers/count?${q}`, admin));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.total, 11); // 12 temp minus 1 null-city
  });
  await check("date range invalid → 400", async () => {
    const res = await exportCount(
      get("/api/export/customers/count?startDate=2025-02-01&endDate=2025-01-01", admin),
    );
    assert.equal(res.status, 400);
  });
  await check("status invalid → 400", async () => {
    const res = await exportCount(get("/api/export/customers/count?status=SALAH", admin));
    assert.equal(res.status, 400);
  });
  await check("filter kosong → 404 export, count 0", async () => {
    const q = "search=tidak-ada-yang-cocok-zzz";
    const c = await exportCount(get(`/api/export/customers/count?${q}`, admin));
    assert.equal((await c.json()).data.total, 0);
    const e = await exportXlsx(get(`/api/export/customers?${q}`, admin));
    assert.equal(e.status, 404);
  });

  // --- batching generator: multi-batch, union lengkap, ordering stabil ---
  await check("iterateCustomerBatches multi-batch + deterministik", async () => {
    const batches: string[][] = [];
    for await (const b of iterateCustomerBatches({}, 5)) {
      batches.push(b.map((r) => r.phone));
    }
    assert.ok(batches.length > 1, "harus lebih dari 1 batch");
    const all = batches.flat();
    const total = await prisma.customer.count();
    assert.equal(all.length, total);
    assert.equal(new Set(all).size, total, "tidak boleh ada duplikat/hilang");
    // deterministik: ulangi, urutan sama
    const again: string[] = [];
    for await (const b of iterateCustomerBatches({}, 5)) {
      again.push(...b.map((r) => r.phone));
    }
    assert.deepEqual(again, all);
  });

  // --- isi xlsx ---
  await check("xlsx valid: sheet, header, rows, phone string, tanggal", async () => {
    const q = new URLSearchParams({ search: probeSearch });
    const res = await exportXlsx(get(`/api/export/customers?${q}`, admin));
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") ?? "").includes("spreadsheetml"));
    assert.ok((res.headers.get("content-disposition") ?? "").includes(".xlsx"));
    const raw = Buffer.from(await res.arrayBuffer());
    assert.ok(raw.subarray(0, 2).toString() === "PK", "harus zip/xlsx");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(Readable.from(raw));
    const ws = wb.getWorksheet("Customers");
    assert.ok(ws, "worksheet Customers harus ada");
    assert.deepEqual(rowValues(ws!.getRow(1)), [...EXPORT_COLUMNS]);
    assert.equal(ws!.rowCount, 13, "header + 12 data");
    const views = ws!.views as { state?: string; ySplit?: number }[];
    assert.ok(
      views.some((v) => v.state === "frozen" && v.ySplit === 1),
      "baris header harus freeze",
    );
    assert.ok(ws!.autoFilter, "autofilter harus aktif");

    const phones = new Set<string>();
    ws!.eachRow((row, n) => {
      if (n === 1) return;
      const phoneCell = row.getCell(2);
      assert.equal(typeof phoneCell.value, "string", "WA harus string");
      assert.equal(phoneCell.numFmt, "@");
      assert.ok(String(phoneCell.value).startsWith("62899"), "digit utuh, bukan notasi ilmiah");
      phones.add(String(phoneCell.value));
      const created = row.getCell(5).value;
      assert.ok(created instanceof Date, "tanggal harus Date Excel");
      assert.equal((created as Date).getFullYear(), 2025);
      const status = String(row.getCell(4).value);
      assert.ok(["Baru", "Follow Up", "Selesai"].includes(status), `label status: ${status}`);
    });
    assert.equal(phones.size, 12);
  });

  await check("xlsx tak mengandung secret/passwordHash", async () => {
    const q = new URLSearchParams({ search: probeSearch });
    const res = await exportXlsx(get(`/api/export/customers?${q}`, admin));
    const wb = await loadWorkbook(res);
    const ws = wb.getWorksheet("Customers")!;
    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value ?? ""))));
    const blob = texts.join("\n").toLowerCase();
    for (const bad of ["passwordhash", "accesstoken", "appsecret", "auth_secret", "wa_session"]) {
      assert.ok(!blob.includes(bad), `kolom sensitif: ${bad}`);
    }
  });

  // --- konkurensi: 3 export paralel, hasil masing-masing benar ---
  await check("3 export paralel tidak tercampur", async () => {
    const mk = (qs: string) => exportXlsx(get(`/api/export/customers?${qs}`, admin));
    const [a, b, c] = await Promise.all([
      mk(`search=${encodeURIComponent(probeSearch)}`),
      mk("city=Bogor"),
      mk("search=tidak-ada-zzz"),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 404);
    const wb = await loadWorkbook(a);
    assert.equal(wb.getWorksheet("Customers")!.rowCount, 13);
  });

  // --- cleanup ---
  await prisma.customer.deleteMany({ where: { name: { startsWith: `ExportProbe ${stamp}` } } });
  console.log("cleanup ok");

  console.log(`\n${passed} test lolos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
