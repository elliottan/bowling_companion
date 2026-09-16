import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// pdf.js is mocked wholesale: this module's job is fetching glyphs and handing
// them on, and the reading it hands them to is tested against a real sheet in
// oilPatternSheet.test.ts.
const getDocument = vi.fn();
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  OPS: { paintImageXObject: 85 },
  getDocument: (args: unknown) => getDocument(args),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/worker.mjs" }));

import { readPatternSheet, readPatternSheetFromUrl } from "./oilPatternPdf";

/** A one page document whose text runs make up a single load table row.
 *  `imageOps` stands in for a page that paints pictures (85 is
 *  paintImageXObject, which the mock below reports as pdf.js does). */
function stubDoc(runs: Array<{ str: string; transform: number[] }>, imageOps = false) {
  return {
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: runs }),
        getOperatorList: async () => ({ fnArray: imageOps ? [85, 91] : [91] }),
        cleanup: () => {},
      }),
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

const ROW = "1 2L 2R 3 50 18 4 A 111 0.0 5.1 5.1 5550";
const runs = ROW.split(" ").map((str, i) => ({ str, transform: [1, 0, 0, 1, i * 18, 700] }));

// jsdom's Blob has no arrayBuffer, and both routes need one. File extends Blob,
// so one definition covers the file the caller picks and the one built from a
// fetched link.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function arrayBuffer() {
    return new Uint8Array([37, 80, 68, 70]).buffer;
  };
}

const pdfFile = (name = "sheet.pdf") =>
  new File(["%PDF-1.4"], name, { type: "application/pdf" });

describe("readPatternSheet", () => {
  beforeEach(() => getDocument.mockReset());

  it("reads the text runs and hands them to the parser", async () => {
    getDocument.mockReturnValue(stubDoc(runs));
    const parsed = await readPatternSheet(pdfFile());
    expect(parsed.passes).toHaveLength(1);
    expect(parsed.passes[0]).toMatchObject({ left_board: 2, right_board: 38, loads: 3 });
  });

  it("tears the worker down even when reading throws", async () => {
    const doc = stubDoc(runs);
    doc.promise = Promise.resolve({
      numPages: 1,
      getPage: async () => {
        throw new Error("broken page");
      },
    }) as never;
    getDocument.mockReturnValue(doc);

    await expect(readPatternSheet(pdfFile())).rejects.toThrow("broken page");
    expect(doc.destroy).toHaveBeenCalled();
  });

  // Kegel's own sheets draw their load tables as pictures, so this is the
  // commonest failure and the one message that must not be "is it a sheet?".
  it("says the tables are pictures rather than doubting it is a sheet", async () => {
    const header = "Oil Pattern Distance 42".split(" ").map((str, i) => ({
      str, transform: [1, 0, 0, 1, i * 18, 700],
    }));
    getDocument.mockReturnValue(stubDoc(header, true));
    await expect(readPatternSheet(pdfFile())).rejects.toThrow(
      /load tables are pictures rather than text/
    );
  });

  it("still doubts a document with neither rows nor pictures", async () => {
    const shopping = "milk bread".split(" ").map((str, i) => ({
      str, transform: [1, 0, 0, 1, i * 18, 700],
    }));
    getDocument.mockReturnValue(stubDoc(shopping, false));
    const parsed = await readPatternSheet(pdfFile());
    expect(parsed.passes).toEqual([]); // the form asks "is it a pattern sheet?"
  });

  it("refuses a file too big to be a pattern sheet", async () => {
    const huge = pdfFile();
    Object.defineProperty(huge, "size", { value: 20 * 1024 * 1024 });
    await expect(readPatternSheet(huge)).rejects.toThrow("too big to be a pattern sheet");
    expect(getDocument).not.toHaveBeenCalled();
  });
});

describe("readPatternSheetFromUrl", () => {
  beforeEach(() => {
    getDocument.mockReset();
    getDocument.mockReturnValue(stubDoc(runs));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the link and reads what comes back", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["%PDF-1.4"]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await readPatternSheetFromUrl("https://example.com/chromium-6742.pdf");
    expect(parsed.passes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("refuses anything that is not an http link", async () => {
    await expect(readPatternSheetFromUrl("not a url")).rejects.toThrow(
      "Enter a full link starting with http:// or https://"
    );
    // The field is rendered as a link elsewhere, so a script scheme never runs.
    await expect(readPatternSheetFromUrl("javascript:alert(1)")).rejects.toThrow(
      "Link must start with http:// or https://"
    );
  });

  // The common case, not an edge one: most bowling sites send no CORS headers,
  // so the message has to carry the fix rather than just the failure.
  it("names the fix when the browser is not allowed to read the file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(readPatternSheetFromUrl("https://example.com/sheet.pdf")).rejects.toThrow(
      /Open the link and import the downloaded file instead/
    );
  });

  it("reports the status when the link is dead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(readPatternSheetFromUrl("https://example.com/gone.pdf")).rejects.toThrow(
      "That link returned 404"
    );
  });
});
