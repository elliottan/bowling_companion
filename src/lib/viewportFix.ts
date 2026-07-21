/**
 * Round 2 of the iOS standalone viewport hunt — see `docs/VIEWPORT-BUG.md`.
 *
 * `position: fixed; inset: 0` fixed the *painting* (no more blank strip), but
 * touch targets are still displaced: the user has to tap above an element to
 * activate it. So iOS is compositing the shell against the live viewport while
 * hit-testing against a stale one. Same root cause, different consequence.
 *
 * Same approach that found the paint fix: ship the candidates together behind a
 * runtime switch, plus a probe that measures the actual displacement on the
 * device instead of inferring it.
 */

export const VIEWPORT_FIXES = ["none", "kick", "scroll", "remount", "all"] as const;
export type ViewportFix = (typeof VIEWPORT_FIXES)[number];

export const FIX_LABELS: Record<ViewportFix, string> = {
  none: "shipped fix, nothing extra",
  kick: "force reflow of the shell",
  scroll: "reset scroll + viewport offset",
  remount: "remount the shell subtree",
  all: "kick + scroll + remount",
};

export const FIX_KEY = "bc:viewport-fix";

export function parseFix(raw: string | null | undefined): ViewportFix {
  return (VIEWPORT_FIXES as readonly string[]).includes(raw ?? "")
    ? (raw as ViewportFix)
    : "none";
}

/**
 * The measurement that matters. Given the element iOS actually delivered a tap
 * to, find how far the DOM thinks that element is from where the tap landed —
 * scanning outward from the tap point until `elementFromPoint` agrees.
 *
 * Returns the vertical displacement in CSS px (negative = the element's hit
 * region sits above where it is painted), or null if no offset explains it.
 */
export function findHitOffset(
  elementFromPoint: (x: number, y: number) => Element | null,
  target: Element,
  x: number,
  y: number,
  range = 240
): number | null {
  for (let d = 0; d <= range; d += 2) {
    const candidates = d === 0 ? [0] : [-d, d];
    for (const dy of candidates) {
      const hit = elementFromPoint(x, y + dy);
      if (hit === target || (hit && target.contains(hit))) return dy;
    }
  }
  return null;
}
