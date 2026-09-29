/**
 * Retention data lama. Default DRY-RUN. Hapus hanya dengan --apply.
 * USE: npm run data:retention [-- --apply]
 * Env: DATA_RETENTION_DAYS=0 → disabled (tidak menghapus apa pun).
 * PERINGATAN: deletion irreversible — backup dulu (npm run db:backup).
 */
import "dotenv/config";
import { retentionDays, runRetention } from "../src/lib/retention";
import { prisma } from "../src/lib/prisma";

async function main() {
  const days = retentionDays();
  if (days <= 0) {
    console.log("Retention disabled (DATA_RETENTION_DAYS=0). Tidak ada yang dihapus.");
    await prisma.$disconnect();
    return;
  }
  const apply = process.argv.includes("--apply");
  const plan = await runRetention(days, apply);
  console.log(`Retention policy: ${plan.days} days`);
  console.log(`Cutoff: ${plan.cutoff.toISOString()}`);
  console.log(`Messages affected: ${plan.messages}`);
  console.log(`Interactions affected: ${plan.interactions}`);
  console.log("Customers affected: 0 (tidak pernah dihapus otomatis)");
  console.log("Users/settings: tidak disentuh.");
  console.log(apply ? "APPLY — records dihapus." : "DRY RUN — no records deleted.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
