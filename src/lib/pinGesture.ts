import type { PinNumber } from "../types/bowling";

export type GestureMode = "select" | "deselect";

/** The mode a gesture locks into, based on the first pin it touches. */
export function modeFor(standing: PinNumber[], firstPin: PinNumber): GestureMode {
  return standing.includes(firstPin) ? "deselect" : "select";
}

/**
 * Apply the locked gesture mode to one pin. Idempotent: select only adds,
 * deselect only removes, so a single stroke never both adds and removes.
 * Returns the same array reference when nothing changes (lets callers skip a
 * re-render). Result stays sorted ascending.
 */
export function applyGesture(
  standing: PinNumber[],
  mode: GestureMode,
  pin: PinNumber
): PinNumber[] {
  const has = standing.includes(pin);
  if (mode === "select") {
    if (has) return standing;
    return [...standing, pin].sort((a, b) => a - b);
  }
  if (!has) return standing;
  return standing.filter((p) => p !== pin);
}
