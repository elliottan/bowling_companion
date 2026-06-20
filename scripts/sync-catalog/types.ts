import type { Manufacturer, WeightSpec } from "../../src/types/catalog.js";

/**
 * Hand-curated input shape for the catalog build pipeline.
 * Human maintains data/balls.json as an array of RawBall.
 * The build script transforms these into CatalogBall[].
 */
export interface RawBall {
  /** Manufacturer name — must be one of the supported values */
  brand: Manufacturer;
  /** Ball model name as printed on the ball */
  name: string;
  /** ISO yyyy-mm-dd release date, or null if unknown */
  releaseDate: string | null;
  /** Exact coverstock string from manufacturer spec sheet */
  coverstockRaw: string;
  /** Factory finish description, or null if unknown */
  factoryFinish: string | null;
  /** Core name, or null if unknown */
  coreName: string | null;
  /** Radius of gyration (two decimal places), or null if unknown */
  rg: number | null;
  /** Total differential, or null if unknown */
  diff: number | null;
  /** Intermediate/mass-bias differential; null means symmetric */
  mbDiff: number | null;
  /** Source URL citations — at least one required */
  sourceUrls: string[];
  /** Optional per-weight specs. 15 lb must match top-level rg/diff/mbDiff when present. */
  weights?: WeightSpec[];
}
