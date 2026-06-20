import type { RawBall } from "./types.js";

const RG_MIN = 2.4;
const RG_MAX = 2.95;
const DIFF_MIN = 0;
const DIFF_MAX = 0.065;
const MB_MIN = 0;
const MB_MAX = 0.055;

/**
 * Validate a RawBall entry.
 * Returns a list of problem strings (empty list = ok).
 * Out-of-range numbers are flagged but the ball is NOT dropped —
 * the caller decides what to do with the flags.
 */
export function validateRaw(b: RawBall): string[] {
  const problems: string[] = [];

  if (!b.brand) problems.push("missing brand");
  if (!b.name || b.name.trim() === "") problems.push("missing name");
  if (!b.coverstockRaw || b.coverstockRaw.trim() === "")
    problems.push("missing coverstockRaw");
  if (!b.sourceUrls || b.sourceUrls.length === 0)
    problems.push("sourceUrls must be non-empty");

  if (b.rg != null) {
    if (!Number.isFinite(b.rg)) {
      problems.push(`rg is not finite (${b.rg})`);
    } else if (b.rg < RG_MIN || b.rg > RG_MAX) {
      problems.push(`rg ${b.rg} out of range [${RG_MIN}, ${RG_MAX}]`);
    }
  }

  if (b.diff != null) {
    if (!Number.isFinite(b.diff)) {
      problems.push(`diff is not finite (${b.diff})`);
    } else if (b.diff < DIFF_MIN || b.diff > DIFF_MAX) {
      problems.push(`diff ${b.diff} out of range [${DIFF_MIN}, ${DIFF_MAX}]`);
    }
  }

  if (b.mbDiff != null) {
    if (!Number.isFinite(b.mbDiff)) {
      problems.push(`mbDiff is not finite (${b.mbDiff})`);
    } else if (b.mbDiff < MB_MIN || b.mbDiff > MB_MAX) {
      problems.push(
        `mbDiff ${b.mbDiff} out of range [${MB_MIN}, ${MB_MAX}]`
      );
    }
  }

  return problems;
}
