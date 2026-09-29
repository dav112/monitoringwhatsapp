/**
 * Deteksi kota deterministik (TANPA AI) dari teks pesan.
 * - Normalisasi: lowercase, buang punctuation, rapikan whitespace.
 * - Matching berbasis word-boundary agar minim false positive
 *   (mis. "jakarta" tidak match di dalam kata lain).
 * - Kata ambigu (padang, malang, batu, serang, solo) HANYA diterima bila ada
 *   kata konteks kota (kota/kabupaten/asal/domisili/...). False negative
 *   lebih baik daripada menyimpan kota yang salah.
 */

type CityEntry = { canonical: string; aliases: string[] };

const CITIES: CityEntry[] = [
  { canonical: "Jakarta", aliases: ["dki jakarta", "jakarta pusat", "jakarta selatan", "jakarta utara", "jakarta timur", "jakarta barat", "kepulauan seribu", "jakarta"] },
  { canonical: "Bogor", aliases: ["kota bogor", "kabupaten bogor", "bogor"] },
  { canonical: "Depok", aliases: ["kota depok", "depok"] },
  { canonical: "Tangerang", aliases: ["kota tangerang", "kabupaten tangerang", "tangerang"] },
  { canonical: "Tangerang Selatan", aliases: ["tangerang selatan", "tangsel"] },
  { canonical: "Bekasi", aliases: ["kota bekasi", "kabupaten bekasi", "bekasi"] },
  { canonical: "Bandung", aliases: ["kota bandung", "kabupaten bandung", "bandung"] },
  { canonical: "Cimahi", aliases: ["cimahi"] },
  { canonical: "Sukabumi", aliases: ["sukabumi"] },
  { canonical: "Cirebon", aliases: ["cirebon"] },
  { canonical: "Tasikmalaya", aliases: ["tasikmalaya"] },
  { canonical: "Serang", aliases: ["kota serang", "kabupaten serang"] },
  { canonical: "Cilegon", aliases: ["cilegon"] },
  { canonical: "Semarang", aliases: ["semarang"] },
  { canonical: "Tegal", aliases: ["tegal"] },
  { canonical: "Pekalongan", aliases: ["pekalongan"] },
  { canonical: "Surakarta", aliases: ["surakarta"] },
  { canonical: "Yogyakarta", aliases: ["yogyakarta", "yogya", "jogja", "kota yogyakarta"] },
  { canonical: "Magelang", aliases: ["magelang"] },
  { canonical: "Surabaya", aliases: ["surabaya"] },
  { canonical: "Kediri", aliases: ["kediri"] },
  { canonical: "Madiun", aliases: ["madiun"] },
  { canonical: "Mojokerto", aliases: ["mojokerto"] },
  { canonical: "Probolinggo", aliases: ["probolinggo"] },
  { canonical: "Jember", aliases: ["jember"] },
  { canonical: "Banyuwangi", aliases: ["banyuwangi"] },
  { canonical: "Denpasar", aliases: ["denpasar"] },
  { canonical: "Mataram", aliases: ["mataram"] },
  { canonical: "Kupang", aliases: ["kupang"] },
  { canonical: "Medan", aliases: ["medan"] },
  { canonical: "Binjai", aliases: ["binjai"] },
  { canonical: "Banda Aceh", aliases: ["banda aceh"] },
  { canonical: "Pekanbaru", aliases: ["pekanbaru"] },
  { canonical: "Dumai", aliases: ["dumai"] },
  { canonical: "Jambi", aliases: ["jambi"] },
  { canonical: "Palembang", aliases: ["palembang"] },
  { canonical: "Bandar Lampung", aliases: ["bandar lampung"] },
  { canonical: "Bengkulu", aliases: ["bengkulu"] },
  { canonical: "Batam", aliases: ["batam"] },
  { canonical: "Tanjung Pinang", aliases: ["tanjung pinang"] },
  { canonical: "Pontianak", aliases: ["pontianak"] },
  { canonical: "Banjarmasin", aliases: ["banjarmasin"] },
  { canonical: "Banjarbaru", aliases: ["banjarbaru"] },
  { canonical: "Balikpapan", aliases: ["balikpapan"] },
  { canonical: "Samarinda", aliases: ["samarinda"] },
  { canonical: "Bontang", aliases: ["bontang"] },
  { canonical: "Tarakan", aliases: ["tarakan"] },
  { canonical: "Makassar", aliases: ["makassar"] },
  { canonical: "Parepare", aliases: ["parepare"] },
  { canonical: "Palopo", aliases: ["palopo"] },
  { canonical: "Manado", aliases: ["manado"] },
  { canonical: "Bitung", aliases: ["bitung"] },
  { canonical: "Palu", aliases: ["palu"] },
  { canonical: "Kendari", aliases: ["kendari"] },
  { canonical: "Ambon", aliases: ["ambon"] },
  { canonical: "Jayapura", aliases: ["jayapura"] },
  { canonical: "Padang", aliases: ["kota padang", "padang"] },
  { canonical: "Malang", aliases: ["kota malang", "kabupaten malang", "malang"] },
];

/** Kata tunggal yang ambigu dengan kata umum → butuh kata konteks. */
const AMBIGUOUS = new Set(["padang", "malang", "serang"]);

/** Kata konteks yang menguatkan bahwa kata ambigu memang nama kota. */
const CONTEXT_CUES = [
  "kota",
  "kabupaten",
  "kab",
  "asal",
  "domisili",
  "berdomisili",
  "tinggal",
  "alamat",
  "beralamat",
  "daerah",
  "wilayah",
  "lokasi",
  "posisi",
  "mudik",
];

export function normalizeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasContextCue(normalized: string): boolean {
  return CONTEXT_CUES.some((cue) => new RegExp(`\\b${escapeRegExp(cue)}\\b`).test(normalized));
}

/** Kembalikan nama kota kanonis (mis. "Bogor") atau null bila tak yakin. */
export function detectCity(raw: unknown): string | null {
  const text = normalizeText(raw);
  if (!text) return null;

  const cue = hasContextCue(text);

  // Alias terpanjang dulu agar "jakarta selatan" menang atas "jakarta".
  const candidates: { alias: string; canonical: string }[] = [];
  for (const city of CITIES) {
    for (const alias of city.aliases) candidates.push({ alias, canonical: city.canonical });
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, canonical } of candidates) {
    if (!new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(text)) continue;
    // Kata ambigu tanpa konteks → lewati (jangan menebak).
    if (AMBIGUOUS.has(alias) && !cue) continue;
    return canonical;
  }
  return null;
}
