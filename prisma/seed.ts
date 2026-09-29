/**
 * Seed database — dummy data mirip Step 1.
 * Idempotent: gunakan upsert agar bisa dijalankan ulang tanpa duplikat.
 * Nomor telepon jelas dummy development (prefix 62810/62811 + 000xxxx).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const CUSTOMERS = [
  { name: "Andi Pratama", phone: "628100000001", city: "Bogor", status: "NEW" },
  { name: "Siti Aminah", phone: "628100000002", city: "Bogor", status: "NEW" },
  { name: "Budi Santoso", phone: "628110000003", city: "Jakarta", status: "COMPLETED" },
  { name: "Dewi Lestari", phone: "628120000004", city: "Depok", status: "FOLLOW_UP" },
  { name: "Rina Marlina", phone: "628110000005", city: "Jakarta", status: "NEW" },
  { name: "Agus Wijaya", phone: "628100000006", city: "Bogor", status: "COMPLETED" },
  { name: "Maya Putri", phone: "628120000007", city: "Depok", status: "FOLLOW_UP" },
  { name: "Rudi Hartono", phone: "628110000008", city: "Jakarta", status: "COMPLETED" },
  { name: "Nina Kurnia", phone: "628100000009", city: "Bogor", status: "NEW" },
  { name: "Dedi Supriadi", phone: "628120000010", city: "Depok", status: "FOLLOW_UP" },
  { name: "Lina Marlisa", phone: "628100000011", city: "Bogor", status: "COMPLETED" },
  { name: "Hendra Gunawan", phone: "628110000012", city: "Jakarta", status: "FOLLOW_UP" },
  { name: "Sari Wulandari", phone: "628100000013", city: "Bogor", status: "NEW" },
  { name: "Tono Prasetyo", phone: "628120000014", city: "Depok", status: "NEW" },
] as const;

const USERS = [
  { name: "Admin Utama", email: "admin@example.local", role: "ADMIN" },
  { name: "Sari Supervisor", email: "supervisor@example.local", role: "SUPERVISOR" },
  { name: "Dimas CS", email: "cs@example.local", role: "CS" },
] as const;

const SETTINGS = [
  { key: "city_question", value: "Kak, boleh tahu dari kota mana?" },
  { key: "save_name", value: "true" },
  { key: "save_phone", value: "true" },
  { key: "save_city", value: "true" },
  { key: "save_timestamp", value: "true" },
  { key: "auto_city_detection", value: "false" },
] as const;

async function main() {
  // Seed DEV-only: tolak di production kecuali eksplisit diizinkan.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "Seed ditolak di production (NODE_ENV=production). " +
        "Buat admin produksi manual; jangan pakai password seed. " +
        "Override darurat: ALLOW_PROD_SEED=true.",
    );
  }
  const passwordHash = await bcrypt.hash("password123", 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role as "ADMIN" | "SUPERVISOR" | "CS", passwordHash },
      create: {
        name: u.name,
        email: u.email,
        role: u.role as "ADMIN" | "SUPERVISOR" | "CS",
        status: "ACTIVE",
        passwordHash,
        lastActiveAt: new Date(),
      },
    });
  }

  for (const c of CUSTOMERS) {
    const customer = await prisma.customer.upsert({
      where: { phone: c.phone },
      update: { name: c.name, city: c.city, status: c.status as "NEW" | "FOLLOW_UP" | "COMPLETED" },
      create: {
        name: c.name,
        phone: c.phone,
        city: c.city,
        status: c.status as "NEW" | "FOLLOW_UP" | "COMPLETED",
      },
    });
    // Satu interaksi awal per customer (idempotent sederhana: skip jika sudah ada)
    const existing = await prisma.customerInteraction.findFirst({
      where: { customerId: customer.id },
      select: { id: true },
    });
    if (!existing) {
      await prisma.customerInteraction.create({
        data: {
          customerId: customer.id,
          type: "CITY_DETECTED",
          content: `Kota terdeteksi: ${c.city} (seed)`,
        },
      });
    }
  }

  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  console.log("Seed selesai: users, customers, settings.");
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
