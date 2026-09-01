export const DONATE_URL = "https://buymeacoffee.com/elliottan";

/** Privacy, terms and the trademark notice. A page on the site rather than a
 *  screen in the app: a store reviewer and a crawler both need a public URL,
 *  and there is only room for one copy of it. */
export const LEGAL_URL = "https://headpin.app/legal";

/** Where feedback goes. An address, not a form: a form is a third party in the
 *  middle of the one conversation the app has, and it cannot be replied to. */
export const FEEDBACK_EMAIL = "hello@headpin.app";

/**
 * A feedback email with the diagnostics already in the body.
 *
 * The point is that nobody has to be asked for their build number. A mail
 * client that drops a prefilled body still gets one, because the caller puts
 * the same text on the clipboard before opening this.
 */
export function feedbackMailto(diagnostics: string): string {
  const body = `\n\n\n${"-".repeat(24)}\n${diagnostics}\n`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Headpin feedback")}&body=${encodeURIComponent(body)}`;
}
