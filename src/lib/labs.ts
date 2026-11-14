/**
 * Labs: screens still being tried out by the owner (the shot tracer), hidden
 * from everyone else. Turned on and off on this device by tapping the version
 * line at the foot of Settings `LABS_TAPS` times, and remembered here as the
 * theme is. Nothing in Labs touches a bowler's games.
 */

const LABS_KEY = "labs";

/** Taps on the version line that turn Labs on or off. */
export const LABS_TAPS = 7;

/** Two taps further apart than this start the count again, milliseconds. */
export const LABS_TAP_GAP_MS = 1500;

export function readLabsOn(): boolean {
  try {
    return localStorage.getItem(LABS_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeLabsOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(LABS_KEY, "on");
    else localStorage.removeItem(LABS_KEY);
  } catch {
    // Private mode or storage blocked: it holds for this run only.
  }
}

/**
 * Counts taps on the version line: the next count after a tap at `now`, given
 * the count so far and when the last tap was. Returns whether this tap is the
 * one that toggles Labs, and the count to keep (back to 0 once it does).
 */
export function countLabsTap(count: number, lastAt: number, now: number): { count: number; toggle: boolean } {
  const next = now - lastAt > LABS_TAP_GAP_MS ? 1 : count + 1;
  return next >= LABS_TAPS ? { count: 0, toggle: true } : { count: next, toggle: false };
}
