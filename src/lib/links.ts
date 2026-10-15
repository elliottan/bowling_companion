export const DONATE_URL = "https://buymeacoffee.com/elliotbowls";

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

/** Hands a `mailto:` link to the platform's mail app. Assigned to `location`
 *  rather than offered to a row as an `href`, which opens a new tab: in an
 *  installed app that is a blank browser sheet instead of Mail. */
export function openMail(url: string): void {
  window.location.href = url;
}

export type CatalogRequestKind = "ball" | "pattern";

/** Long enough for any ball or pattern name, short enough that a pasted
 *  paragraph cannot become the subject line. */
const REQUEST_QUERY_MAX = 60;

/**
 * An email asking for a ball or an oil pattern to be added to the catalog, with
 * whatever the bowler searched for already in it.
 *
 * It goes to the feedback address, so there is one inbox to reply from, and the
 * subject prefix is what lets it be filtered out of the rest. No diagnostics
 * ride along: a request needs no build number, and the feedback flow's clipboard
 * write would be a surprise here.
 */
export function catalogRequestMailto(kind: CatalogRequestKind, query: string): string {
  const typed = query.trim().slice(0, REQUEST_QUERY_MAX);
  const lead = kind === "ball" ? "Ball request" : "Pattern request";
  const subject = typed ? `${lead}: ${typed}` : lead;
  const body =
    kind === "ball"
      ? `Brand:\nBall: ${typed}\nLink to the spec sheet or product page (optional):\n`
      : `Pattern: ${typed}\nWho publishes it (Kegel, a league, a tournament):\nLink to the pattern sheet:\nLength in feet (optional):\n`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Where a catalog ball's "Shop" link goes, and how it is credited to Headpin.
 * BowlersMart's affiliate program runs on Rakuten, whose deep link takes the
 * retailer page as its `murl` parameter.
 *
 * The retailer is searched by brand and name rather than linked to a product
 * page: a search cannot go stale when the retailer renames a page, and it needs
 * no table of 250 product URLs to keep in step with the catalog (ADR-119).
 */
export const RETAILER_NAME = "BowlersMart";

export function retailerSearchUrl(brand: string, name: string): string {
  // A WordPress store: `s` is the search, and `post_type` keeps it to products
  // rather than the blog.
  return `https://www.bowlersmart.com/?s=${encodeURIComponent(`${brand} ${name}`)}&post_type=product`;
}

/**
 * The affiliate network's deep link, with `{url}` where the retailer page
 * goes. Paste it from the network's link builder once the program accepts
 * Headpin. Null hides the link: an uncredited link earns nothing, and a
 * disclosure over a link that pays nobody would not be true.
 */
export const AFFILIATE_DEEP_LINK: string | null = null;

/** The credited link to buy a catalog ball, or null while there is none. */
export function shopBallUrl(
  brand: string,
  name: string,
  deepLink: string | null = AFFILIATE_DEEP_LINK
): string | null {
  if (!deepLink) return null;
  return deepLink.replace("{url}", encodeURIComponent(retailerSearchUrl(brand, name)));
}
