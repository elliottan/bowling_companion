export type CoverstockCategory = "Solid" | "Pearl" | "Hybrid" | "Urethane";
export type CoreType = "Symmetric" | "Asymmetric";
export type Manufacturer = "Storm" | "Roto Grip" | "900 Global" | "Motiv";

export interface WeightSpec {
  weight: number;       // pounds, e.g. 15
  rg: number | null;
  diff: number | null;
  mbDiff: number | null;
}

export const DEFAULT_WEIGHT = 15;

/**
 * A single color variant of a ball. Specs are shared across colorways (same
 * core/coverstock), so colorways differ only by SKU, color name, and image.
 * colorways[0] is the default shown in the catalog. Image fields are optional
 * and populated by the image pipeline (Phase 6); null/undefined until then.
 */
export interface Colorway {
  sku: string;
  color: string | null;
  imageThumb?: string | null;   // "/catalog/img/<hash>-thumb.webp"
  imageFull?: string | null;    // "/catalog/img/<hash>-full.webp"
}

export interface CatalogBall {
  id: string;              // stable: slug(`${brand}-${name}-${releaseYear}`)
  brand: Manufacturer;
  name: string;
  releaseDate: string | null;   // ISO yyyy-mm-dd if known, else null
  releaseYear: number | null;
  coverstockRaw: string;        // exact source string, preserved
  coverstockCategory: CoverstockCategory | null; // null = unclassified (flag in PR)
  factoryFinish: string | null;
  coreName: string | null;
  coreType: CoreType | null;    // Asymmetric if MB Diff present & > 0, else Symmetric
  rg: number | null;
  diff: number | null;
  mbDiff: number | null;
  imageThumb: string | null;    // "/catalog/img/<hash>-thumb.webp"
  imageFull: string | null;     // "/catalog/img/<hash>-full.webp"
  sourceUrl: string;            // manufacturer product page
  weights?: WeightSpec[];       // per-weight specs; top-level rg/diff/mbDiff = 15 lb default
  colorways?: Colorway[];       // color variants; colorways[0] is the default
}

export interface CatalogManifest {
  version: number;       // monotonically increasing
  generatedAt: string;   // ISO timestamp
  ballCount: number;
  hash: string;          // hash of catalog.json contents
}
