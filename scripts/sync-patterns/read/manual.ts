/**
 * Reading a pattern sheet by eye, typed rather than parsed from a PDF (ADR-104).
 *
 * Not every sheet arrives as a PDF. A phone photo of a printed sheet, or a page
 * pasted from an email, has no text layer and no image pdf.js can hand to OCR:
 * there is no file for `read-pdf.ts` to open. The person or agent reading it
 * still transcribes rows in the sheet's own words, one row per load table line
 * and the header figures Kegel already labels DISTANCE, FORWARD, REVERSE and
 * VOLUME, and this reader runs the transcription through the exact same grammar
 * `sheet-text.ts` reads a real text layer with: the same two row layouts, the
 * same header labels, the same checks. A typed row is not read more carefully
 * for being typed, and the point stands: nothing here decides whether the
 * reading is good. `promote.ts` does, from the sheet's own arithmetic.
 */
import { basename } from "node:path";

import { HEADER, parseSheetLines, type SheetCheck } from "./sheet-text.js";
import { normalizePatternName, slug, statedFrom } from "./read-pdf.js";
import type { PatternCandidate } from "../types.js";
import { oilStats, headlineRatio } from "../../../src/lib/oilPattern.js";

export interface ManualReading {
  candidate: PatternCandidate;
  checks: SheetCheck[];
  verified: boolean;
}

/**
 * Read a plain-text transcription of a sheet: the header figures on their own
 * lines, then the load table rows, copied exactly as printed. Either Kegel row
 * layout `parseSheetLines` already reads (CROSSED or arrow) is accepted, since
 * this is the same parser a real text layer goes through.
 */
export function readManual(
  path: string,
  text: string,
  opts: { vendor?: string; sourceUrl?: string; name?: string } = {}
): ManualReading {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = parseSheetLines(lines);
  const stats = oilStats(parsed.passes);
  const name = normalizePatternName(opts.name ?? parsed.name ?? basename(path));

  return {
    candidate: {
      id: slug(name),
      name,
      vendor: opts.vendor ?? "kegel",
      sourceUrl: opts.sourceUrl,
      reader: "manual",
      passes: parsed.passes,
      stated: {
        distance: statedFrom(lines, HEADER.distance),
        forwardMl: statedFrom(lines, HEADER.forward),
        reverseMl: statedFrom(lines, HEADER.reverse),
        volumeMl: statedFrom(lines, HEADER.volume),
      },
      note: `${basename(path)} · read by eye · ${stats.length} ft · ${
        headlineRatio(parsed.passes)?.toFixed(2) ?? "?"
      }:1`,
    },
    checks: parsed.checks,
    verified: parsed.verified,
  };
}
