/**
 * MOTIV's coverstock acronyms, as MOTIV themselves expand them.
 *
 * Their spec cell often names the cover without saying what type it is
 * ("Coercion HFS Reactive"), which leaves the build unable to classify it and
 * the catalog unable to filter for it. The acronym holds the answer, and the
 * letters look like a system: first the friction or volume, last the type,
 * S solid, P pearl, H hybrid.
 *
 * That reading is not the reason any entry is in this table. Every one of them
 * is here because a MOTIV page spells the acronym out in full, and the quote
 * that does it is recorded beside it. An acronym MOTIV have not expanded
 * somewhere is not in this table, however obvious its letters look: guessing
 * from a pattern is how "HFP" becomes a pearl on the strength of arithmetic
 * rather than evidence, and a wrong cover type is not visibly wrong later.
 *
 * To add one, find a MOTIV page that writes the expansion and quote it.
 * `rg 'ACRONYM \(' ` over their product pages is how these six were found.
 */

export interface CoverAcronym {
  /** How MOTIV write it out. */
  expansion: string;
  /** The catalog's category, or null when the expansion names none. */
  type: "Solid" | "Pearl" | "Hybrid" | "Urethane" | null;
  /** A MOTIV page that states the expansion, and its words. */
  sourceUrl: string;
  quote: string;
}

const P = "https://www.motivbowling.com/products/balls";

export const MOTIV_COVER_ACRONYMS: Record<string, CoverAcronym> = {
  HFS: {
    expansion: "High Friction Solid",
    type: "Solid",
    sourceUrl: `${P}/retired-balls/covert-revolt.html`,
    quote:
      "The Covert Revolt also features new Turmoil HFS (High Friction Solid) cover stock",
  },
  MFS: {
    expansion: "Medium Friction Solid",
    type: "Solid",
    sourceUrl: `${P}/retired-balls/t10-limited-edition.html`,
    quote:
      "The cover on the Limited Edition T10 is Coercion MFS (Medium Friction Solid) Reactive",
  },
  LFP: {
    expansion: "Low Friction Pearl",
    type: "Pearl",
    sourceUrl: `${P}/retired-balls/freestyle-pink-black.html`,
    quote: "The new Turmoil LFP (Low Friction Pearl) cover retains energy on light oil",
  },
  MFP: {
    expansion: "Medium Friction Pearl",
    type: "Pearl",
    sourceUrl: `${P}/retired-balls/venom-panic.html`,
    quote: "The new Turmoil MFP (Medium Friction Pearl) Pearl Reactive cover stock",
  },
  HVH: {
    expansion: "High Volume Hybrid",
    type: "Hybrid",
    sourceUrl: `${P}/exclusives/trident-shield.html`,
    quote: "Coercion HVH (High Volume Hybrid) cover stock is also new technology",
  },
  // Recorded because MOTIV expand it, but it names a material of their own
  // rather than one of the four types, so it classifies nothing. It is here so
  // the next person reads the evidence instead of re-deriving the question.
  MCP: {
    expansion: "Microcell Polymer",
    type: null,
    sourceUrl: `${P}/retired-balls/blue-tank.html`,
    quote: "to engineer this new MCP (Microcell Polymer) shell",
  },
};

/**
 * The type MOTIV's own expansion gives a coverstock, or null when no token in
 * it is an acronym they have spelled out.
 */
export function acronymCoverType(coverstockRaw: string): string | null {
  for (const token of coverstockRaw.split(/[\s/]+/)) {
    const hit = MOTIV_COVER_ACRONYMS[token.toUpperCase()];
    if (hit?.type) return hit.type;
  }
  return null;
}
