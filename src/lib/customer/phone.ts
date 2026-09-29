/**
 * Normalisasi nomor WhatsApp ke format `628...` (tanpa +, tanpa spasi/strip).
 * Contoh: "+62 812-3456-7890" → "628123456789", "0812..." → "62812...".
 * Return null jika tidak terlihat seperti nomor yang valid.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.trim().replace(/^\+/, "");
  // "00" prefix internasional → hapus
  if (d.startsWith("00")) d = d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.length === 0) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  // Validasi longgar: 62 + 8–14 digit
  if (!/^62\d{8,14}$/.test(d)) return null;
  return d;
}
