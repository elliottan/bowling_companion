/**
 * How big the app's type is (ADR-219).
 *
 * Three sizes multiply, and the page's CSS (`:root` in `src/index.css`) does the
 * multiplying:
 *
 *   --os-text-scale    what the phone says. The iPhone app writes it from
 *                      Dynamic Type (`HeadpinViewController`); nothing writes it
 *                      anywhere else, so it is 1. A browser scales `rem` from
 *                      its own default size, and the Android web view follows
 *                      the system font size itself, so neither needs to say.
 *   --user-text-scale  the bowler's Text size setting, below.
 *   --text-scale       the two multiplied and held between `TEXT_SCALE_MIN` and
 *                      `TEXT_SCALE_MAX`.
 *   --type-scale       what the type scale (`tailwind.config.js`) reads. It is
 *                      `--text-scale` until a dense surface lowers it
 *                      (`.type-cap-dense`, `.type-cap-fixed`).
 *
 * The CSS and this file state the same bounds, because the browser must be able
 * to clamp before any script has run. `textScale.test.ts` reads the stylesheet
 * and fails if they drift.
 */

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.6;
/** What `.type-cap-dense` holds the scorecard grid, charts and tables to. */
export const TEXT_SCALE_DENSE_MAX = 1.2;

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type TextSizeId = "default" | "large" | "larger" | "largest";

export interface TextSize {
  id: TextSizeId;
  /** A descriptor, read through `i18n._` in render: this list is built at import. */
  label: MessageDescriptor;
  /** Multiplies the phone's own size. */
  scale: number;
}

export const DEFAULT_TEXT_SIZE: TextSizeId = "default";

export const TEXT_SIZES: readonly TextSize[] = [
  { id: "default", label: msg({ message: "Default", comment: "Text size setting: the standard size" }), scale: 1 },
  { id: "large", label: msg({ message: "Large", comment: "Text size setting: one step bigger than the standard size" }), scale: 1.15 },
  { id: "larger", label: msg({ message: "Larger", comment: "Text size setting: two steps bigger than the standard size" }), scale: 1.3 },
  { id: "largest", label: msg({ message: "Largest", comment: "Text size setting: the biggest size" }), scale: 1.5 }
];

const IDS = new Set<string>(TEXT_SIZES.map((s) => s.id));

/** Holds a scale between the floor and the ceiling. Not a number reads as 1. */
export function clampTextScale(n: number, max = TEXT_SCALE_MAX): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(max, Math.max(TEXT_SCALE_MIN, n));
}

/** The phone's size times the bowler's, held to the bounds. */
export function combinedTextScale(os: number, user: number, max = TEXT_SCALE_MAX): number {
  return clampTextScale((Number.isFinite(os) && os > 0 ? os : 1) * (Number.isFinite(user) && user > 0 ? user : 1), max);
}

export function textSizeScale(id: TextSizeId): number {
  return TEXT_SIZES.find((s) => s.id === id)?.scale ?? 1;
}

/** The size a dense surface really draws at, for a given combined scale. */
export function denseTextScale(combined: number): number {
  return Math.min(combined, TEXT_SCALE_DENSE_MAX);
}

const KEY = "textSize";

/**
 * The stored size, from localStorage, where it lives beside the theme for the
 * same reason: a script that runs before React mounts reads it, and an
 * IndexedDB read is too late to stop the page painting at the wrong size. The
 * settings table (`getTextSize`) holds it too, so a backup carries it.
 */
export function readTextSize(): TextSizeId {
  try {
    const v = localStorage.getItem(KEY);
    return v && IDS.has(v) ? (v as TextSizeId) : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

export function rememberTextSize(id: TextSizeId) {
  try {
    if (id === DEFAULT_TEXT_SIZE) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the size still applies for this session.
  }
}

/** Puts the bowler's size on <html>, where the stylesheet multiplies it. */
export function applyTextSize(id: TextSizeId) {
  document.documentElement.style.setProperty("--user-text-scale", String(textSizeScale(id)));
}

/** The phone's own size, as the iPhone app wrote it. 1 anywhere else. */
export function readOsTextScale(): number {
  const raw = document.documentElement.style.getPropertyValue("--os-text-scale");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Applies the stored size at start, before the first screen is drawn. */
export function startTextSize() {
  applyTextSize(readTextSize());
}

export function isTextSizeId(v: unknown): v is TextSizeId {
  return typeof v === "string" && IDS.has(v);
}
