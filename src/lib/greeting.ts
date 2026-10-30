import { i18n } from "@lingui/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

/**
 * The line Home opens with. Short on purpose: it is a hello, not a headline,
 * and with a name on the end it still has to fit one line on a phone.
 *
 * Most of them are about bowling, because a greeting that could open any app
 * says nothing about this one. No contractions and no exclamation marks
 * (DESIGN-LANGUAGE §8).
 */
const GREETING_MESSAGES: MessageDescriptor[] = [
  msg({ message: "Hey", comment: "A short greeting at the top of Home; the bowler's name may follow it" }),
  msg({ message: "Welcome back", comment: "A short greeting at the top of Home; the bowler's name may follow it" }),
  msg({ message: "Ready to roll", comment: "A short greeting at the top of Home; the bowler's name may follow it" }),
  msg({ message: "Time to bowl", comment: "A short greeting at the top of Home; the bowler's name may follow it" }),
  msg({ message: "Find the pocket", comment: "A short greeting at the top of Home; the bowler's name may follow it. The pocket is the bowling term for the gap between the 1 and 3 pins that a good strike ball hits" }),
  msg({ message: "Lanes are open", comment: "A short greeting at the top of Home; the bowler's name may follow it" })
];

/** The greetings, read in the active language at the moment one is picked: each
 *  entry is a getter over its message, so nothing is fixed at import. */
export const GREETINGS: readonly string[] = (() => {
  const list: string[] = [];
  GREETING_MESSAGES.forEach((descriptor, i) => {
    Object.defineProperty(list, i, { get: () => i18n._(descriptor), enumerable: true });
  });
  return list;
})();

/** A greeting picked by `index`, wrapped, with the name on the end when there
 *  is one. The caller picks the index, so the choice is testable and holds
 *  still for the life of a screen rather than changing on every render. */
export function greeting(name: string | null | undefined, index: number): string {
  const n = GREETINGS.length;
  const line = GREETINGS[((Math.floor(index) % n) + n) % n];
  const who = name?.trim();
  return who
    ? t({ message: `${line}, ${who}`, comment: "The greeting on Home with the bowler's name on the end: a greeting, then the name" })
    : line;
}
