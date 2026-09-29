/**
 * Diagnostik production-readiness (env, secret strength, DB, webhook config).
 * USE: npm run wa:check [baseUrl]
 * AMAN: tidak pernah mencetak nilai secret — hanya configured/missing/weak/invalid/ok.
 */
import "dotenv/config";
import { getEnvReport, productionEnvReady, type EnvStatus } from "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function line(name: string, s: EnvStatus): string {
  return `${name.padEnd(30)} ${s}`;
}

async function main() {
  console.log("Environment\n");
  const report = getEnvReport();
  for (const [k, v] of Object.entries(report)) console.log(line(k, v));
  const prod = productionEnvReady();
  console.log(
    `\nproduction secrets: ${prod.ready ? "READY" : "NOT READY (" + prod.problems.join(", ") + ")"}`,
  );
  console.log("No secrets are displayed.");

  console.log("\nDatabase\n");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("DATABASE                        reachable");
  } catch {
    console.log("DATABASE                        UNREACHABLE");
  } finally {
    await prisma.$disconnect();
  }

  const base = process.argv[2] || process.env.WA_BASE_URL || "http://localhost:3000";
  console.log(`\nChecking ${base}/api/health ...`);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base.replace(/\/$/, "")}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`health endpoint: HTTP ${res.status} (pastikan server jalan)`);
      return;
    }
    const json = (await res.json()) as Record<string, unknown>;
    console.log(`health endpoint: OK (status=${JSON.stringify(json.status)})`);
    console.log(`  database: ${JSON.stringify(json.database)}`);
    console.log(`  whatsapp: ${JSON.stringify(json.whatsapp)}`);
  } catch {
    console.log("health endpoint: unreachable (jalankan server dulu)");
  }

  console.log("\nChecking wa/status leak-guard ...");
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/wa/status`);
    if (res.status === 401) {
      console.log("wa/status: 401 tanpa session (expected — butuh login)");
    } else if (res.ok) {
      const body = await res.text();
      const secrets = [
        process.env.WHATSAPP_ACCESS_TOKEN,
        process.env.WHATSAPP_APP_SECRET,
        process.env.WHATSAPP_VERIFY_TOKEN,
        process.env.AUTH_SECRET,
        process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY,
      ].filter((v): v is string => Boolean(v && v.trim().length >= 4));
      const leaked = secrets.some((v) => body.includes(v.trim()));
      console.log(leaked ? "wa/status: VALUE EXPOSED (BAD!)" : "wa/status: secret leak none (good)");
    } else {
      console.log(`wa/status: HTTP ${res.status}`);
    }
  } catch {
    console.log("wa/status: unreachable");
  }

  if (!prod.ready) {
    console.log("\nBelum production-ready — lihat README bagian Production.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
