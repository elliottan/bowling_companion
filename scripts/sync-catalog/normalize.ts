import type { CoverstockCategory, CoreType } from "../../src/types/catalog.js";

/**
 * Map a raw coverstock string to a CoverstockCategory.
 * Rules are applied in priority order (case-insensitive substring match).
 * Returns null if no rule matches — the human must classify it.
 */
export function mapCoverstock(raw: string): CoverstockCategory | null {
  const lower = raw.toLowerCase();
  if (lower.includes("urethane")) return "Urethane";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("pearl")) return "Pearl";
  if (lower.includes("solid")) return "Solid";
  return null;
}

/**
 * Derive core type from mbDiff.
 * Asymmetric if mbDiff is present and > 0; otherwise Symmetric.
 */
export function deriveCoreType(mbDiff: number | null): CoreType {
  return mbDiff != null && mbDiff > 0 ? "Asymmetric" : "Symmetric";
}

/** Roman numeral map — handles I through VIII (covers all real ball names) */
const ROMAN: Record<string, string> = {
  viii: "8",
  vii: "7",
  vi: "6",
  iv: "4",
  v: "5",
  iii: "3",
  ii: "2",
  i: "1",
};

/**
 * Normalize a ball name for slug / search matching:
 * - lowercase
 * - replace roman numerals with digits (longest match first)
 * - strip non-alphanumeric characters (keep spaces)
 * - collapse whitespace
 */
export function normalizeName(name: string): string {
  let s = name.toLowerCase();
  // Replace roman numerals that appear as whole words.
  // Longest alternatives first so "III" beats "I".
  for (const [roman, digit] of Object.entries(ROMAN)) {
    s = s.replace(new RegExp(`\\b${roman}\\b`, "g"), digit);
  }
  // Strip punctuation (keep alphanumeric and spaces)
  s = s.replace(/[^a-z0-9 ]/g, " ");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Simple slugify: lowercase + replace non-alphanumeric runs with hyphens */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build a stable, human-readable ball id.
 * Format: `${slugify(brand)}-${normalizeName(name).replace(/\s+/g,'-')}-${releaseYear ?? ''}` trimmed of trailing dash.
 */
export function slug(
  brand: string,
  name: string,
  releaseYear: number | null
): string {
  const brandSlug = slugify(brand);
  const nameSlug = normalizeName(name).replace(/\s+/g, "-");
  const yearPart = releaseYear != null ? String(releaseYear) : "";
  const raw = `${brandSlug}-${nameSlug}-${yearPart}`;
  return raw.replace(/-+$/, "");
}
