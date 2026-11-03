import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Expands a control's tap target to 44pt vertically without changing its
 *  visual size. Requires the element to be `relative`. Callers must leave at
 *  least 8px of vertical gap to neighbouring controls so hit regions don't overlap. */
export const TAP_TARGET_44 = 'after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[""]';

/** Dense filter/segmented chip. Visually `h-9` (36px) so rows of them don't
 *  eat vertical space on a 390px screen, but its hit region is expanded to
 *  44pt via an invisible `::after` pseudo-element, the CSS equivalent of
 *  UIKit's hit-test expansion. The expansion is vertical only (4px overhang
 *  top and bottom); it deliberately does not expand horizontally, because
 *  that would make neighbouring chips' hit regions overlap. Callers laying
 *  out chips that wrap onto multiple rows MUST use `gap-2` (8px) between
 *  rows so the expanded hit regions meet exactly and never overlap.
 *  `min-w-11` keeps short labels (e.g. single-digit lane numbers) from
 *  presenting too narrow a target. Uses `aria-pressed`, matching this app's
 *  existing chip convention, never `role="tab"`/`aria-selected`.
 *
 *  Drawn as iOS 26 draws a filter capsule (ADR-229): off, the same flat grey
 *  fill as the segmented control's track, with no border; on, filled in the
 *  accent. A bordered white chip read as a web button, and beside the
 *  segmented control's grey (ADR-227) it was a second family of control. */
export function Chip({
  selected,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`relative inline-flex h-9 min-w-11 items-center justify-center rounded-full px-3.5 text-footnote ${TAP_TARGET_44} ${
        selected ? "chip-on bg-accent-fill font-semibold text-accent-on-fill" : "chip-off font-medium text-ink"
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
