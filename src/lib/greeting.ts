/**
 * The line Home opens with. Short on purpose: it is a hello, not a headline,
 * and with a name on the end it still has to fit one line on a phone.
 *
 * Most of them are about bowling, because a greeting that could open any app
 * says nothing about this one. No contractions and no exclamation marks
 * (DESIGN-LANGUAGE §8).
 */
export const GREETINGS = [
  "Hey",
  "Welcome back",
  "Ready to roll",
  "Time to bowl",
  "Find the pocket",
  "Lanes are open"
] as const;

/** A greeting picked by `index`, wrapped, with the name on the end when there
 *  is one. The caller picks the index, so the choice is testable and holds
 *  still for the life of a screen rather than changing on every render. */
export function greeting(name: string | null | undefined, index: number): string {
  const n = GREETINGS.length;
  const line = GREETINGS[((Math.floor(index) % n) + n) % n];
  const who = name?.trim();
  return who ? `${line}, ${who}` : line;
}
