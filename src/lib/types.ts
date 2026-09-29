/** Tipe data dari API database (Step 2). Mock di src/data/mock/* hanya untuk halaman yg belum migrasi. */

export type CustomerStatus = "NEW" | "FOLLOW_UP" | "COMPLETED";

export interface ApiCustomer {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInteraction {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DashboardData {
  totalCustomers: number;
  customersToday: number;
  customersThisWeek: number;
  customersThisMonth: number;
  customersByCity: { city: string | null; count: number }[];
  recentCustomers: ApiCustomer[];
  growth14d: { label: string; value: number }[];
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SUPERVISOR" | "CS";
  status: "ACTIVE" | "INACTIVE";
  lastActiveAt: string | null;
  createdAt: string;
}

export interface WaLastMessage {
  phone: string;
  messageType: string;
  content: string;
  direction: string;
  createdAt: string;
  customer: { name: string } | null;
}

export interface WaStatusData {
  configured: boolean;
  phoneNumberConfigured: boolean;
  webhookConfigured: boolean;
  appSecretConfigured: boolean;
  apiReachable: boolean | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  totalInbound: number;
  lastMessage: WaLastMessage | null;
}
export const STATUS_LABEL: Record<CustomerStatus, string> = {
  NEW: "Baru",
  FOLLOW_UP: "Follow Up",
  COMPLETED: "Selesai",
};

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
