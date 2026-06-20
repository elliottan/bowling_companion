export type CoverstockCategory = "Solid" | "Pearl" | "Hybrid" | "Urethane";
export type CoreType = "Symmetric" | "Asymmetric";
export type Manufacturer = "Storm" | "Roto Grip" | "900 Global" | "Motiv";

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
}

export interface CatalogManifest {
  version: number;       // monotonically increasing
  generatedAt: string;   // ISO timestamp
  ballCount: number;
  hash: string;          // hash of catalog.json contents
}
