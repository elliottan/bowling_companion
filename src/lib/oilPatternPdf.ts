import { parseSheetItems, type ParsedSheet, type SheetTextItem } from "./oilPatternSheet";

/**
 * The pdf.js half of reading a pattern sheet (ADR-102): a file goes in, text
 * runs with their positions come out, and `oilPatternSheet` does the reading.
 * The split is on purpose. Everything that decides what a number means is pure
 * and tested against a real sheet's rows; this module only fetches glyphs.
 *
 * pdf.js is imported dynamically, and only from here, so its 1.7 MB of parser
 * and worker land in their own chunk rather than in the app every bowler
 * downloads to keep score.
 */

/** Anything larger is not a pattern sheet, and would lock the tab up parsing. */
const MAX_BYTES = 12 * 1024 * 1024;

export async function readPatternSheet(file: File): Promise<ParsedSheet> {
  if (file.size > MAX_BYTES) {
    throw new Error("That file is too big to be a pattern sheet.");
  }

  const pdfjs = await import("pdfjs-dist");
  // Vite emits the worker as its own asset; without this pdf.js falls back to
  // parsing on the main thread and freezes the page on anything real.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const items: SheetTextItem[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        // transform is [a, b, c, d, e, f]; e and f are the run's position.
        const [, , , , x, y] = item.transform as number[];
        // Pages are stacked so a two page sheet reads in order rather than
        // interleaving its rows by height.
        items.push({ text: item.str, x, y: y - n * 10_000 });
      }
      page.cleanup();
    }
    return parseSheetItems(items);
  } finally {
    // Destroying the loading task tears the worker down with it; leaking one
    // per import would keep a megabyte of parser alive per sheet read.
    await task.destroy();
  }
}
