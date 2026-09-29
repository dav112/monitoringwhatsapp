/** MOCK users — Step 1 only. */
export type UserRole = "Admin" | "Supervisor" | "CS";

export type AppUser = {
  id: string;
  nama: string;
  email: string;
  role: UserRole;
  status: "aktif" | "nonaktif";
  lastActive: string;
};

export const MOCK_USERS: AppUser[] = [
  { id: "U-01", nama: "Admin Utama", email: "admin@toko.id", role: "Admin", status: "aktif", lastActive: "28 Sep 2026, 09:30" },
  { id: "U-02", nama: "Sari Supervisor", email: "sari@toko.id", role: "Supervisor", status: "aktif", lastActive: "28 Sep 2026, 09:10" },
  { id: "U-03", nama: "Dimas CS", email: "dimas@toko.id", role: "CS", status: "aktif", lastActive: "28 Sep 2026, 08:55" },
  { id: "U-04", nama: "Putri CS", email: "putri@toko.id", role: "CS", status: "aktif", lastActive: "27 Sep 2026, 17:20" },
  { id: "U-05", nama: "Riko CS", email: "riko@toko.id", role: "CS", status: "nonaktif", lastActive: "25 Sep 2026, 12:00" },
];
