/** Lowercase, with everything but letters and digits taken out. */
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether a catalog ball's words contain what was typed.
 *
 * Plainly, and then again with spaces and punctuation taken out of both sides,
 * because a ball's name is spelled however its maker spells it and a bowler
 * types it however they say it: "astro physix" is Storm's AstroPhysiX, and
 * "hyroad" is the Hy-Road. Typing the name exactly still finds it the first
 * way, so the second only ever adds matches.
 */
export function matchesCatalogSearch(parts: readonly (string | null | undefined)[], query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (text.includes(q)) return true;
  const cq = compact(q);
  return cq !== "" && compact(text).includes(cq);
}
