import type { OilPass } from "../../src/types/bowling.js";

/**
 * Oil pattern catalog ingest (ADR-104).
 *
 * The shape of a staged reading, before anything is promoted. Mirrors the ball
 * pipeline's candidate (ADR-043): a reader stages one of these per sheet, and
 * `promote.ts` re-checks it with no reader in the loop.
 */

/** Who read the sheet, which decides how far the reading is trusted. */
export type Reader =
  /** The PDF's own text layer, read by `read/sheet-text.ts`. */
  | "text-layer"
  /** Tesseract over the sheet's table images, repaired by `read/ocr-repair.ts`. */
  | "ocr"
  /** A person or an agent, reading the sheet by eye. */
  | "manual";

/** What a sheet prints about itself, and what the promote stage checks against. */
export interface StatedTotals {
  /** Oil Pattern Distance, in feet. */
  distance?: number;
  forwardMl?: number;
  reverseMl?: number;
  volumeMl?: number;
}

export interface PatternCandidate {
  /** Stable id, slugged from the name. */
  id: string;
  name: string;
  /** Where the sheet came from, so a reading can always be gone back to. */
  sourceUrl?: string;
  /** Machine or brand the sheet is written for, e.g. "kegel". */
  vendor: string;
  reader: Reader;
  passes: OilPass[];
  /** Read off the sheet's header, never derived. This is the check. */
  stated: StatedTotals;
  /** The sheet's own file name or a note, for a human reading a conflict. */
  note?: string;
}

/** A promoted pattern, as it ships. */
export interface CatalogPattern {
  id: string;
  name: string;
  vendor: string;
  sourceUrl?: string;
  /** Derived and stored, because the app should not have to compute a list. */
  distance: number;
  volumeMl: number;
  ratio: number | null;
  passes: OilPass[];
}

export interface PatternCatalog {
  version: 1;
  generated_at: string;
  patterns: CatalogPattern[];
}
