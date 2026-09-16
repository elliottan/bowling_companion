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
/** Whether any page paints an image, which is how a scanned or drawn table
 *  shows up. Only asked on the no-rows path, since it costs an operator list
 *  per page. */
async function hasPictures(pages: Array<{ getOperatorList: () => Promise<{ fnArray: number[] }> }>): Promise<boolean> {
  const { OPS } = await import("pdfjs-dist");
  for (const page of pages) {
    const ops = await page.getOperatorList();
    if (ops.fnArray.some((fn) => fn === OPS.paintImageXObject)) return true;
  }
  return false;
}

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
    // Kegel's own generator draws the load tables as pictures and leaves only
    // the header in the text layer, so the commonest way to find no rows is a
    // genuine, current pattern sheet whose tables cannot be read as text at all.
    // Saying "is it a pattern sheet?" to someone holding one is worse than
    // useless, so the two cases are told apart before either is reported.
    if (parsed.passes.length === 0 && (await hasPictures(pages))) {
      throw new Error(
        "This sheet's load tables are pictures rather than text, so they cannot be read. Type the rows in below, or import a sheet that has them as text."
      );
    }
    for (const page of pages) page.cleanup();
    return parsed;
  } finally {
    // Destroying the loading task tears the worker down with it; leaking one
    // per import would keep a megabyte of parser alive per sheet read.
    await task.destroy();
  }
}
