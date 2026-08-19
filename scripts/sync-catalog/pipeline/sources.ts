/**
 * Where a ball's specs can be read from, and which route to take.
 *
 * The routes differ enormously in cost and trustworthiness, so choosing between
 * them is worth doing explicitly rather than letting whoever runs the pipeline
 * reach for a browser first:
 *
 *   pdf   , the manufacturer's own tech sheet on the SPI CDN. Parsed by
 *            `parse-ball`, deterministic, no model, official.
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

/** SPI hosts its brands under one CDN; the folder names are not the brand names. */
export const BRAND_FOLDER: Record<string, string> = {
  Storm: "Storm",
  "Roto Grip": "Roto_Grip",
  "900 Global": "900_Global",
  Motiv: "Motiv",
};

/**
 * Candidate tech-sheet URLs for a ball. SPI's filenames are inconsistent enough
 * that probing a handful is cheaper than maintaining a mapping by hand.
 */
export function candidateUrls(brand: string, name: string): string[] {
  const brandFolder = BRAND_FOLDER[brand];
  if (!brandFolder) return [];
  const folder = name.replace(/\//g, "").replace(/ /g, "_");
  const noSpace = name.replace(/[/ ]/g, "");
  const base = `${SPI_CDN}/${brandFolder}/${folder}/`;
  const files = [
    `Storm_adsheet_${noSpace}-nobleed.pdf`,
    `${name} Tech Data Final.pdf`,
    `${name} Tech Data.pdf`,
    `Storm_${name}_Tech Data.pdf`,
    `Storm_${noSpace}_Design Intent.pdf`,
    `${noSpace} Tech Data Final.pdf`,
  ];
  return files.map((f) => encodeURI(base + f));
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

export async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status === 200;
  } catch {
    return false;
  }
}

export type Route = "pdf" | "bowwwl" | "manual";

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
  for (const url of candidateUrls(brand, name)) {
    if (await headOk(url)) return { brand, name, route: "pdf", url };
  }
  const page = bowwwlUrl(brand, name);
  if (await headOk(page)) return { brand, name, route: "bowwwl", url: page };

  const base = tryBaseName ? baseName(name) : null;
  if (base) {
    for (const url of candidateUrls(brand, base)) {
      if (await headOk(url)) return { brand, name, route: "pdf", url, nameUsed: base };
    }
    const basePage = bowwwlUrl(brand, base);
    if (await headOk(basePage)) {
      return { brand, name, route: "bowwwl", url: basePage, nameUsed: base };
    }
  }
  return { brand, name, route: "manual", url: null };
}
