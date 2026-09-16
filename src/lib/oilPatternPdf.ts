import { parseSheetItems, parseSheetLines, sheetLines, type ParsedSheet, type SheetTextItem } from "./oilPatternSheet";
import type { SheetImage } from "./oilPatternOcrReader";

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

/**
 * Fetch a sheet the bowler has a link to, and read it the same way.
 *
 * This works only where the host serves the PDF with CORS headers, and most
 * bowling sites do not: the browser refuses to hand a cross-origin response to
 * a page that was not invited to read it, and a PWA with no backend has nothing
 * to proxy through. The two ways around it both cost more than they are worth.
 * A public CORS proxy would send every link a bowler imports to a stranger's
 * server, which breaks the one promise this feature makes, that the sheet is
 * read on your own phone. A backend of our own would be the first server this
 * app has ever needed, for the sake of downloading a public PDF that the
 * browser can already download by being pointed at it.
 *
 * So a blocked link is reported as what it is, with the fix the bowler can
 * actually apply: open the link and pick the file. A fetch failure here is
 * indistinguishable from an offline one at the API level, so the message names
 * both rather than guessing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/** Every image a page paints, pulled out of pdf.js's object store. Only asked
 *  on the no-rows path, since it costs an operator list per page. */
async function tableImages(pages: any[]): Promise<SheetImage[]> {
  const { OPS } = await import("pdfjs-dist");
  const found: SheetImage[] = [];
  for (const page of pages) {
    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
      const name = ops.argsArray[i]?.[0];
      if (typeof name !== "string") continue;
      const image = await new Promise<SheetImage | null>((resolve) => {
        try {
          page.objs.get(name, (obj: any) => {
            // Only RGBA comes back ready to draw; anything else is skipped
            // rather than guessed at, and the sheet simply does not import.
            const expected = obj?.width * obj?.height * 4;
            resolve(obj?.data && obj.data.length === expected
              ? { width: obj.width, height: obj.height, data: obj.data }
              : null);
          });
        } catch {
          resolve(null);
        }
      });
      if (image) found.push(image);
    }
  }
  return found;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function readPatternSheetFromUrl(rawUrl: string): Promise<ParsedSheet> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a full link starting with http:// or https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Link must start with http:// or https://");
  }

  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch {
    throw new Error(
      "Could not fetch that link. The site may not allow other pages to read its files, or you may be offline. Open the link and import the downloaded file instead."
    );
  }
  if (!response.ok) {
    throw new Error(`That link returned ${response.status}. Check it, or import the file instead.`);
  }

  const blob = await response.blob();
  const name = url.pathname.split("/").pop() || "pattern-sheet.pdf";
  return readPatternSheet(new File([blob], name, { type: "application/pdf" }));
}

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
    const pages = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      pages.push(page);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        // transform is [a, b, c, d, e, f]; e and f are the run's position.
        const [, , , , x, y] = item.transform as number[];
        // Pages are stacked so a two page sheet reads in order rather than
        // interleaving its rows by height.
        items.push({ text: item.str, x, y: y - n * 10_000 });
      }
    }

    const parsed = parseSheetItems(items);
    if (parsed.passes.length > 0) {
      for (const page of pages) page.cleanup();
      return parsed;
    }

    // Kegel's own generator leaves only the header in the text layer and draws
    // both load tables as pictures, so finding no rows is not the odd case: it
    // is what a current, genuine sheet looks like. The pictures are read with
    // OCR (ADR-103) and checked against the header, which IS text and so is
    // trustworthy, rather than against themselves.
    const images = await tableImages(pages);
    for (const page of pages) page.cleanup();
    if (images.length === 0) return parsed;

    const { readTableImages } = await import("./oilPatternOcrReader");
    const scanned = await readTableImages(images);
    if (scanned.length === 0) return parsed;
    return parseSheetLines([...sheetLines(items), ...scanned]);
  } finally {
    // Destroying the loading task tears the worker down with it; leaking one
    // per import would keep a megabyte of parser alive per sheet read.
    await task.destroy();
  }
}
