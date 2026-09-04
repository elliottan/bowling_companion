/**
 * A session can be started with nothing filled in (ADR-080), so every place
 * that prints the alley needs one word for the alley that was never named.
 * "Unnamed session" rather than a blank: a row with no title reads as a
 * rendering fault, and the session is still perfectly real.
 */
export const UNNAMED_ALLEY = "Unnamed session";

/** The alley as it is shown on screen, for a session that may not name one. */
export function alleyLabel(alleyName: string | undefined): string {
  return alleyName?.trim() || UNNAMED_ALLEY;
}
