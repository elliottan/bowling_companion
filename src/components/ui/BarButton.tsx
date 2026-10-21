import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TAP_TARGET_44 } from "./Chip";

/**
 * A word on chrome: a glass capsule carrying "Edit", the way iOS writes the
 * action that turns a read screen into a form (DESIGN-LANGUAGE §1b, ADR-168).
 *
 * A pencil glyph in a round said the same thing less clearly, and beside a
 * close and a tick it read as one more icon rather than as the switch between
 * reading and editing. The round controls stay for what a glyph says at once
 * (back, close, the commit's tick, share); this is for the verb.
 *
 * 44pt tall like every chrome control, and as wide as its word. `label` is the
 * spoken name when the word alone is short of it ("Edit ball", not "Edit").
 */
export function BarButton({
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`glass inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-4 text-[15px] font-semibold text-ink transition-transform active:scale-95 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The same verb inside content rather than on chrome: a small tinted capsule,
 * iOS's bordered button, for an "Edit" that belongs to one card in a list (a
 * lane's notes). Drawn 28px tall with the 44pt hit region on an invisible
 * `::after`, as `Chip` carries it, so it rides in a heading row without setting
 * the row's height.
 */
export function TintedButton({
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`relative inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-accent/10 px-3 text-xs font-semibold text-accent active:opacity-70 disabled:cursor-not-allowed disabled:opacity-50 ${TAP_TARGET_44} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
