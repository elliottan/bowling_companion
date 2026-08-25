/**
 * Where a ball's specs can be read from, and which route to take.
 *
 * The routes differ enormously in cost and trustworthiness, so choosing between
 * them is worth doing explicitly rather than letting whoever runs the pipeline
 * reach for a browser first:
 *
 *   pdf   , the manufacturer's own tech sheet on the SPI CDN. Parsed by
 *            `parse-ball`, deterministic, no model, official.
 *   motiv , MOTIV's own product page. Parsed by `parse-motiv`, deterministic,
 *            no model, official. MOTIV granted use of the site's data in
 *            August 2026; SPI's CDN carries none of their balls.
 *   bowwwl, a third-party spec database with one labelled field per spec.
 *            Parsed by `parse-bowwwl`, deterministic, no model, not official.
 *   manual, neither exists. Only here does a model read a page, and only here
 *            do the quote and second-site rules bite (ADR-043).
 *
 * URL shapes are probed with HEAD requests, never guessed at and reported as
 * fact, because a wrong URL handed to a parser fails loudly but a wrong URL
 * recorded as a source lies quietly.
 */

const SPI_CDN =
  "https://stormproducts.nyc3.cdn.digitaloceanspaces.com/product_pages/Balls";

const MOTIV_ORIGIN = "https://www.motivbowling.com";

/**
 * Says who is calling. MOTIV's edge rejects the bare "Mozilla/5.0" the other
 * parsers send, since it is a stock bot signature, and naming the tool is the
 * better answer anyway: they gave permission to a project, so the requests
 * should be attributable to it.
 */
export const MOTIV_USER_AGENT =
  "bowling-companion-catalog-sync/1.0 (+https://github.com/elliottan/bowling_companion)";

/** SPI hosts its brands under one CDN; the folder names are not the brand names. */
export const BRAND_FOLDER: Record<string, string> = {
  Storm: "Storm",
  "Roto Grip": "Roto_Grip",
  "900 Global": "900_Global",
  Motiv: "Motiv",
};

function cdnBase(brand: string, name: string): string | null {
  const brandFolder = BRAND_FOLDER[brand];
  if (!brandFolder) return null;
  const folder = name.replace(/\//g, "").replace(/ /g, "_");
  return `${SPI_CDN}/${brandFolder}/${folder}/`;
}

/**
 * Tech-data sheets: the documents that actually carry an RG/DIFF table. SPI's
 * filenames are inconsistent enough that probing a handful is cheaper than
 * maintaining a mapping by hand.
 *
 * Ad sheets are deliberately not in here. They exist for most balls and return
 * 200, but they are marketing pages with no spec table, so counting one as a
 * spec source routes a ball to a parser that can only fail on it.
 */
export function techDataUrls(brand: string, name: string): string[] {
  const base = cdnBase(brand, name);
  if (!base) return [];
  const noSpace = name.replace(/[/ ]/g, "");
  const files = [
    `${name} Tech Data Final.pdf`,
    `${name} Tech Data.pdf`,
    `Storm_${name}_Tech Data.pdf`,
    `${noSpace} Tech Data Final.pdf`,
    `Storm_${noSpace}_Design Intent.pdf`,
  ];
  return files.map((f) => encodeURI(base + f));
}

/**
 * Every PDF worth probing for an embedded hero render, ad sheets first: they
 * are the ball on a plain ground, which is exactly what the image stage wants.
 */
export function candidateUrls(brand: string, name: string): string[] {
  const base = cdnBase(brand, name);
  if (!base) return [];
  const noSpace = name.replace(/[/ ]/g, "");
  return [
    encodeURI(`${base}Storm_adsheet_${noSpace}-nobleed.pdf`),
    ...techDataUrls(brand, name),
  ];
}

function urlSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The aggregator's page for a ball, by its own URL convention. */
export function bowwwlUrl(brand: string, name: string): string {
  return `https://www.bowwwl.com/bowling-ball-database/${urlSlug(brand)}/${urlSlug(name)}`;
}

/**
 * MOTIV files each ball under its oil category (`/products/balls/heavy-oil/`),
 * which no ball name implies, so the URL cannot be built from the name the way
 * the others can. Their sitemap lists every page, so it is read once per run
 * and indexed by slug: a lookup, never a guess.
 */
/**
 * The promise is what is memoised, not the map it resolves to. The router
 * routes several balls at once, so caching the map would let the second caller
 * find an index that exists but is still empty and conclude the ball is not on
 * the site: every ball after the first would fall through to bowwwl.
 */
let motivIndex: Promise<Map<string, string>> | null = null;

async function loadMotivIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  try {
    const res = await fetch(`${MOTIV_ORIGIN}/sitemap.xml`, {
      headers: { "user-agent": MOTIV_USER_AGENT },
    });
    const xml = await res.text();
    for (const m of xml.matchAll(/<loc>([^<]*\/products\/balls\/[^<]*?)\.html<\/loc>/g)) {
      index.set(m[1].slice(m[1].lastIndexOf("/") + 1), `${m[1]}.html`);
    }
  } catch {
    // Leave the index empty: every lookup misses and the balls route on to
    // bowwwl, rather than a network blip being reported as "no such ball".
  }
  return index;
}

export async function motivUrl(name: string): Promise<string | null> {
  motivIndex ??= loadMotivIndex();
  return (await motivIndex).get(urlSlug(name)) ?? null;
}

export async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status === 200;
  } catch {
    return false;
  }
}

export type Route = "pdf" | "motiv" | "bowwwl" | "manual";

export interface RoutedBall {
  brand: string;
  name: string;
  route: Route;
  url: string | null;
  /** Set only when the URL was found under a different name than the queued one. */
  nameUsed?: string;
}

/**
 * USBC lists a row per colorway, so a queue carries names like
 * "Hustle Vanilla/Popsicle" that no manufacturer or database page is filed
 * under. Dropping the trailing slash-run finds the base ball.
 *
 * This is opt-in, and never silent, because the same shape also appears on
 * genuinely distinct balls: "Attention 78/U" is a urethane model, not a
 * colourway of "Attention", and reducing it would file one ball's specs under
 * another's name. The reduced name is reported so a human rejects that case
 * before the specs are read.
 */
export function baseName(name: string): string | null {
  if (!name.includes("/")) return null;
  const tokens = name.split(" ");
  const first = tokens.findIndex((t) => t.includes("/"));
  if (first <= 0) return null;
  return tokens.slice(0, first).join(" ");
}

/** First route that actually responds, in trust order. */
export async function routeBall(
  brand: string,
  name: string,
  tryBaseName = false
): Promise<RoutedBall> {
  for (const url of techDataUrls(brand, name)) {
    if (await headOk(url)) return { brand, name, route: "pdf", url };
  }
  if (brand === "Motiv") {
    const url = await motivUrl(name);
    if (url) return { brand, name, route: "motiv", url };
  }
  const page = bowwwlUrl(brand, name);
  if (await headOk(page)) return { brand, name, route: "bowwwl", url: page };

  const base = tryBaseName ? baseName(name) : null;
  if (base) {
    for (const url of techDataUrls(brand, base)) {
      if (await headOk(url)) return { brand, name, route: "pdf", url, nameUsed: base };
    }
    if (brand === "Motiv") {
      const url = await motivUrl(base);
      if (url) return { brand, name, route: "motiv", url, nameUsed: base };
    }
    const basePage = bowwwlUrl(brand, base);
    if (await headOk(basePage)) {
      return { brand, name, route: "bowwwl", url: basePage, nameUsed: base };
    }
  }
  return { brand, name, route: "manual", url: null };
}
