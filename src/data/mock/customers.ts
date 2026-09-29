/**
 * MOCK DATA customers — Step 1 only.
 * Akan diganti API/database di Step 2.
 */
export type CustomerStatus = "baru" | "aktif" | "pending" | "nonaktif";

export type Customer = {
  id: string;
  nama: string;
  wa: string;
  kota: "Bogor" | "Jakarta" | "Depok" | "Lainnya";
  tanggal: string;
  status: CustomerStatus;
};

export const MOCK_CUSTOMERS: Customer[] = [
  { id: "C-001", nama: "Siti Aminah", wa: "081234567890", kota: "Bogor", tanggal: "2026-09-28", status: "baru" },
  { id: "C-002", nama: "Budi Santoso", wa: "081398765432", kota: "Jakarta", tanggal: "2026-09-28", status: "aktif" },
  { id: "C-003", nama: "Dewi Lestari", wa: "082111223344", kota: "Depok", tanggal: "2026-09-27", status: "aktif" },
  { id: "C-004", nama: "Andi Pratama", wa: "085766778899", kota: "Bogor", tanggal: "2026-09-27", status: "pending" },
  { id: "C-005", nama: "Rina Marlina", wa: "081900112233", kota: "Jakarta", tanggal: "2026-09-27", status: "baru" },
  { id: "C-006", nama: "Agus Wijaya", wa: "081255566677", kota: "Bogor", tanggal: "2026-09-26", status: "aktif" },
  { id: "C-007", nama: "Maya Putri", wa: "082188899900", kota: "Depok", tanggal: "2026-09-26", status: "aktif" },
  { id: "C-008", nama: "Rudi Hartono", wa: "081377788899", kota: "Jakarta", tanggal: "2026-09-25", status: "nonaktif" },
  { id: "C-009", nama: "Nina Kurnia", wa: "085211122233", kota: "Bogor", tanggal: "2026-09-25", status: "baru" },
  { id: "C-010", nama: "Dedi Supriadi", wa: "081299988877", kota: "Depok", tanggal: "2026-09-24", status: "pending" },
  { id: "C-011", nama: "Lina Marlisa", wa: "082144455566", kota: "Bogor", tanggal: "2026-09-24", status: "aktif" },
  { id: "C-012", nama: "Hendra Gunawan", wa: "081388899911", kota: "Jakarta", tanggal: "2026-09-23", status: "aktif" },
];

export const CITY_OPTIONS = ["Semua", "Bogor", "Jakarta", "Depok", "Lainnya"] as const;
export const STATUS_OPTIONS = ["Semua", "baru", "aktif", "pending", "nonaktif"] as const;
