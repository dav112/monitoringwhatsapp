/**
 * MOCK DATA — Step 1 frontend only.
 * Semua data di folder ini adalah dummy dan akan diganti
 * dengan API/database pada Step 2.
 */

export const MOCK_META = {
  isMock: true,
  note: "Dummy data Step 1 — ganti dengan API/database di Step 2",
} as const;

export const dashboardStats = {
  ...MOCK_META,
  totalCustomer: 1248,
  customerHariIni: 128,
  activeToday: 96,
  responseRate: 87,
};

export const customerGrowth = {
  ...MOCK_META,
  // 14 hari terakhir
  series: [
    { label: "14/9", value: 42 },
    { label: "15/9", value: 55 },
    { label: "16/9", value: 48 },
    { label: "17/9", value: 71 },
    { label: "18/9", value: 64 },
    { label: "19/9", value: 89 },
    { label: "20/9", value: 76 },
    { label: "21/9", value: 95 },
    { label: "22/9", value: 104 },
    { label: "23/9", value: 88 },
    { label: "24/9", value: 112 },
    { label: "25/9", value: 97 },
    { label: "26/9", value: 121 },
    { label: "27/9", value: 128 },
  ],
};

export const cityDistribution = {
  ...MOCK_META,
  cities: [
    { city: "Bogor", count: 420, color: "#1d8a52" },
    { city: "Jakarta", count: 315, color: "#34b06a" },
    { city: "Depok", count: 187, color: "#a8e6a1" },
    { city: "Lainnya", count: 326, color: "#e7eae4" },
  ],
};

export type RecentCustomer = {
  id: string;
  nama: string;
  wa: string;
  kota: string;
  tanggal: string;
  status: "baru" | "aktif" | "pending";
};

export const recentCustomers: RecentCustomer[] = [
  { id: "1", nama: "Siti Aminah", wa: "0812-3456-7890", kota: "Bogor", tanggal: "28 Sep 2026, 09:12", status: "baru" },
  { id: "2", nama: "Budi Santoso", wa: "0813-9876-5432", kota: "Jakarta", tanggal: "28 Sep 2026, 08:45", status: "aktif" },
  { id: "3", nama: "Dewi Lestari", wa: "0821-1122-3344", kota: "Depok", tanggal: "27 Sep 2026, 16:20", status: "aktif" },
  { id: "4", nama: "Andi Pratama", wa: "0857-6677-8899", kota: "Bogor", tanggal: "27 Sep 2026, 14:02", status: "pending" },
  { id: "5", nama: "Rina Marlina", wa: "0819-0011-2233", kota: "Jakarta", tanggal: "27 Sep 2026, 11:37", status: "baru" },
];
