import { repairOcrLines } from "./oilPatternOcr";

/**
 * Running OCR over a sheet's table images, in the browser (ADR-103).
 *
 * Kept apart from the repair logic next door, which is pure and is where the
 * reasoning lives, so the part that can be tested against a real sheet's output
 * is not tangled up with the part that drives a wasm worker.
 *
 * Every asset is bundled and served from our own origin: tesseract fetches its
 * worker, its core and its language data from a CDN by default, and an app that
 * works in an alley with no signal cannot depend on that. They are lazy, so
 * nothing here is downloaded until a bowler imports a sheet whose tables are
 * pictures.
 */

/** Upscale before reading. At native size the decimal points are a pixel and
 *  vanish; six times over is where they survive on a real Kegel sheet. */
const SCALE = 6;
/** Below this the ink is ink and above it the page is page. Binarising costs
 *  nothing and stops the anti-aliased edges reading as extra digits. */
const INK = 140;

export interface SheetImage {
  width: number;
  height: number;
  /** RGBA, as pdf.js hands it over. */
  data: Uint8ClampedArray;
}

/** A table is wider than it is tall and takes up real space on the page. The
 *  logo and the graph are not, so they are never handed to OCR. */
export function looksLikeTable(image: { width: number; height: number }): boolean {
  const ratio = image.width / image.height;
  return image.width >= 300 && ratio > 1.1 && ratio < 4;
}

function toCanvas(image: SheetImage): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  // Copied into a fresh buffer: pdf.js hands back a view onto its own memory,
  // which ImageData will not take and which it may reuse behind us.
  const rgba = new Uint8ClampedArray(image.data.length);
  rgba.set(image.data);
  source.getContext("2d")!.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);

  const scaled = document.createElement("canvas");
  scaled.width = image.width * SCALE;
  scaled.height = image.height * SCALE;
  const ctx = scaled.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);

  const pixels = ctx.getImageData(0, 0, scaled.width, scaled.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grey = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
    const bw = grey < INK ? 0 : 255;
    pixels.data[i] = bw;
    pixels.data[i + 1] = bw;
    pixels.data[i + 2] = bw;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return scaled;
}

/** Read every table image, and give back the lines they hold, repaired. */
export async function readTableImages(images: readonly SheetImage[]): Promise<string[]> {
  const tables = images.filter(looksLikeTable);
  if (tables.length === 0) return [];

  const { createWorker, PSM } = await import("tesseract.js");
  const [workerPath, corePath, langPath] = await Promise.all([
    import("tesseract.js/dist/worker.min.js?url").then((m) => m.default),
    import("tesseract.js-core/tesseract-core-lstm.wasm.js?url").then((m) => m.default),
    import("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url").then((m) => m.default),
  ]);

  const worker = await createWorker("eng", 1, {
    workerPath,
    // tesseract appends "/<lang>.traineddata.gz", so it is given the folder.
    langPath: langPath.replace(/\/[^/]+$/, ""),
    corePath,
    gzip: true,
    legacyCore: false,
    legacyLang: false,
  });
  try {
    await worker.setParameters({
      // A load table is digits, the L and R of a board, the A or B of a tank,
      // and the point and minus of a distance. Nothing else belongs, and saying
      // so keeps a 5 from being read as an S.
      tessedit_char_whitelist: "0123456789LRAB.- ",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    const lines: string[] = [];
    for (const table of tables) {
      const { data } = await worker.recognize(toCanvas(table));
      lines.push(...data.text.split("\n"));
    }
    return repairOcrLines(lines);
  } finally {
    await worker.terminate();
  }
}
