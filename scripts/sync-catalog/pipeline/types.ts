import type { Colorway, Manufacturer, WeightSpec } from "../../../src/types/catalog.js";

/**
 * A single reading of a single field, with the receipt that justifies it.
 *
 * The extraction stage is allowed to read and quote; it is never allowed to
 * judge. Every number it emits must be traceable to the verbatim text it came
 * from, because an agent reading a spec page will otherwise happily emit a
 * plausible RG the page never stated. `quote` is what makes that failure
 * visible in review instead of invisible in prod.
 */
export interface Evidence<T> {
  value: T;
  /** The document the value was read from. */
  sourceUrl: string;
  /** Verbatim text from that document containing the value. Never paraphrased. */
  quote: string;
  /**
   * Name of the deterministic parser that produced this reading, when one did
   * (`parse-bowwwl`, `parse-ball`). A parser reads a labelled field or a fixed
   * PDF layout and cannot invent a plausible number the way a model can, so a
   * parser reading stands on its own: no quote, and no second site. Absent
   * means a model read it, and then both are required.
   */
  parser?: string;
}

/** Every field carries its readings as a list, one entry per source consulted. */
export type Readings<T> = Evidence<T>[];

/**
 * Staged, unpromoted output of the extraction stage: one file per ball under
 * data/candidates/. Shapes onto RawBall only after promote.ts has checked the
 * receipts.
 */
export interface BallCandidate {
  brand: Manufacturer;
  name: string;
  /**
   * True when the readings come from a manufacturer-published document (spec
   * sheet PDF, tech data, the brand's own product page). An official document
   * is the ground truth, so one reading suffices; corroborating it against a
   * site that transcribed it is theatre. Everything else needs two.
   */
  official: boolean;
  releaseDate: Readings<string>;
  coverstockRaw: Readings<string>;
  factoryFinish: Readings<string>;
  coreName: Readings<string>;
  rg: Readings<number>;
  diff: Readings<number>;
  mbDiff: Readings<number>;
  /** Whole-array readings, per-weight rows are quoted as one block. */
  weights?: Readings<WeightSpec[]>;
  colorways?: Readings<Colorway[]>;
  /** Direct product image URL, fed to the image stage. */
  imageUrl?: Readings<string>;
}

/** One ball asked for by a run. Stage 1 emits these; stage 2 consumes them. */
export interface QueueEntry {
  brand: string;
  name: string;
  /** Where the candidate came from, e.g. "usbc-index 2026-06-02". */
  via: string;
}
