/**
 * Reading one pattern sheet PDF, at build time (ADR-104).
 *
 * Routing, in ADR-044's sense: a sheet with a real text layer is read by the
 * parser, and only a sheet that draws its tables as pictures pays for OCR.
 * Kegel's own sheets are the second kind, which is what moved this whole job
 * out of the app and in here.
 *
 * Nothing in this file decides whether a reading is good. That is `promote.ts`,
 * which re-derives the sheet's own printed totals with no reader in the loop.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { parseSheetLines, sheetLines, type SheetTextItem } from "./sheet-text.js";
import { repairOcrLines } from "./ocr-repair.js";
import type { PatternCandidate, Reader } from "../types.js";
import { oilStats, headlineRatio } from "../../../src/lib/oilPattern.js";

/** Upscale and threshold, the settings that read a real Kegel table. */
const SCALE = 6;
const INK = 140;
/** A table is wider than it is tall and takes real space; a logo is not. */
const isTable = (w: number, h: number) => w >= 300 && w / h > 1.1 && w / h < 4;

interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface SheetContents {
  items: SheetTextItem[];
  images: RawImage[];
}

async function openSheet(path: string): Promise<SheetContents> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  const items: SheetTextItem[] = [];
  const images: RawImage[] = [];

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== "string" || !item.transform) continue;
      const [, , , , x, y] = item.transform;
      // Pages are stacked so a two page sheet reads in order.
      items.push({ text: item.str, x, y: y - n * 10_000 });
    }

    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const name = ops.argsArray[i]?.[0];
      if (typeof name !== "string") continue;
      const image = await new Promise<RawImage | null>((resolve) => {
        try {
          page.objs.get(name, (obj: RawImage | undefined) => {
            const rgba = obj && obj.data?.length === obj.width * obj.height * 4;
            resolve(rgba && isTable(obj.width, obj.height) ? obj : null);
          });
        } catch {
          resolve(null);
        }
      });
      if (image) images.push(image);
    }
  }
  return { items, images };
}

/**
 * Upscale, binarise and encode.
 *
 * The interpolation is the whole trick. A decimal point on a Kegel table is
 * about one pixel, and a nearest-neighbour upscale turns it into a hard square
 * that thresholding then eats: read that way the sheet loses three passes and
 * seven of its own checks. Sampling smoothly keeps the point as grey that
 * survives the threshold, which is the difference between a sheet that verifies
 * and one that does not.
 *
 * Tesseract will not take raw pixels, so the page goes to it as a PNG, and
 * pngjs keeps that free of a native dependency.
 */
async function prepare(image: RawImage): Promise<Buffer> {
  const w = image.width * SCALE;
  const h = image.height * SCALE;
  const out = Buffer.alloc(w * h * 4);

  const grey = (x: number, y: number): number => {
    const cx = Math.min(image.width - 1, Math.max(0, x));
    const cy = Math.min(image.height - 1, Math.max(0, y));
    const s = (cy * image.width + cx) * 4;
    return (image.data[s] + image.data[s + 1] + image.data[s + 2]) / 3;
  };

  for (let y = 0; y < h; y += 1) {
    const sy = (y + 0.5) / SCALE - 0.5;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x += 1) {
      const sx = (x + 0.5) / SCALE - 0.5;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const top = grey(x0, y0) * (1 - fx) + grey(x0 + 1, y0) * fx;
      const bottom = grey(x0, y0 + 1) * (1 - fx) + grey(x0 + 1, y0 + 1) * fx;
      const bw = top * (1 - fy) + bottom * fy < INK ? 0 : 255;
      const d = (y * w + x) * 4;
      out[d] = bw;
      out[d + 1] = bw;
      out[d + 2] = bw;
      out[d + 3] = 255;
    }
  }

  const { PNG } = await import("pngjs");
  const png = new PNG({ width: w, height: h });
  out.copy(png.data);
  return PNG.sync.write(png);
}

async function scanTables(images: RawImage[]): Promise<string[]> {
  if (images.length === 0) return [];
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    // The language pack ships in node_modules, so a run needs no network.
    langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int",
    gzip: true,
    cacheMethod: "none",
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789LRAB.- ",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const lines: string[] = [];
    for (const image of images) {
      const { data } = await worker.recognize(await prepare(image));
      lines.push(...data.text.split("\n"));
    }
    return repairOcrLines(lines);
  } finally {
    await worker.terminate();
  }
}

export interface SheetReading {
  candidate: PatternCandidate;
  /** Every check the sheet made of itself, for the run's report. */
  checks: ReturnType<typeof parseSheetLines>["checks"];
  verified: boolean;
}

/** Read one sheet, by whichever route it needs. */
export async function readSheet(path: string, opts: { vendor?: string; sourceUrl?: string } = {}): Promise<SheetReading> {
  const { items, images } = await openSheet(path);
  const textLines = sheetLines(items);

  let parsed = parseSheetLines(textLines);
  let reader: Reader = "text-layer";
  if (parsed.passes.length === 0 && images.length > 0) {
    parsed = parseSheetLines([...textLines, ...(await scanTables(images))]);
    reader = "ocr";
  }

  const stats = oilStats(parsed.passes);
  const name = parsed.name ?? basename(path).replace(/\.pdf$/i, "");
  return {
    candidate: {
      id: slug(name),
      name,
      vendor: opts.vendor ?? "kegel",
      sourceUrl: opts.sourceUrl,
      reader,
      passes: parsed.passes,
      stated: {
        distance: statedFrom(textLines, /Oil Pattern Distance/i),
        forwardMl: statedFrom(textLines, /Forward Oil Total/i),
        reverseMl: statedFrom(textLines, /Reverse Oil Total/i),
        volumeMl: statedFrom(textLines, /Volume Oil Total/i),
      },
      note: `${basename(path)} · ${stats.length} ft · ${headlineRatio(parsed.passes)?.toFixed(2) ?? "?"}:1`,
    },
    checks: parsed.checks,
    verified: parsed.verified,
  };
}

function statedFrom(lines: readonly string[], label: RegExp): number | undefined {
  for (const line of lines) {
    const at = line.search(label);
    if (at < 0) continue;
    const m = /(-?\d+(?:\.\d+)?)/.exec(line.slice(at).replace(label, ""));
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
