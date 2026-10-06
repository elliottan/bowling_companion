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
