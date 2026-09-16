import { describe, expect, it, vi, beforeEach } from "vitest";

const createWorker = vi.fn();
vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
  PSM: { SINGLE_BLOCK: 6 },
}));
vi.mock("tesseract.js/dist/worker.min.js?url", () => ({ default: "/a/worker.min.js" }));
vi.mock("tesseract.js-core/tesseract-core-lstm.wasm.js?url", () => ({ default: "/a/core.js" }));
vi.mock("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url", () => ({
  default: "/a/lang/eng.traineddata.gz",
}));

import { looksLikeTable, readTableImages, type SheetImage } from "./oilPatternOcrReader";

const image = (width: number, height: number): SheetImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

describe("looksLikeTable", () => {
  it("takes the load tables off a real sheet", () => {
    // Chromium 6742's two tables, as pdf.js reports them.
    expect(looksLikeTable({ width: 484, height: 320 })).toBe(true);
  });

  it("leaves the logo and the pattern graph alone", () => {
    expect(looksLikeTable({ width: 135, height: 163 })).toBe(false); // the Kegel logo
    expect(looksLikeTable({ width: 881, height: 881 })).toBe(false); // the graph, square
    expect(looksLikeTable({ width: 1024, height: 210 })).toBe(false); // a rule, too wide
    expect(looksLikeTable({ width: 210, height: 1024 })).toBe(false); // the ruler, tall
  });
});

describe("readTableImages", () => {
  const recognize = vi.fn();
  const terminate = vi.fn();
  const setParameters = vi.fn();

  beforeEach(() => {
    createWorker.mockReset();
    recognize.mockReset();
    terminate.mockReset();
    setParameters.mockReset();
    createWorker.mockResolvedValue({ recognize, setParameters, terminate });
    // jsdom has neither ImageData nor a 2d context, and this module only needs
    // the calls to land: what the pixels become is tesseract's problem.
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    );
    vi.spyOn(document, "createElement").mockImplementation(
      () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({
            putImageData: () => {},
            drawImage: () => {},
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
            }),
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "high",
          }),
        }) as unknown as HTMLElement
    );
  });

  it("does not start a worker when there is no table to read", async () => {
    expect(await readTableImages([image(135, 163)])).toEqual([]);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("reads a table and repairs what it read", async () => {
    // A row whose decimal points OCR dropped, exactly as the real sheet does.
    recognize.mockResolvedValue({
      data: { text: "1 2L 2R 3 50 18 4 A 111 00 51 51 5550\n" },
    });

    const lines = await readTableImages([image(484, 320)]);
    expect(lines.some((l) => l.includes("0.0 5.1 5.1"))).toBe(true);
    expect(terminate).toHaveBeenCalled();
  });

  it("serves its own assets rather than a CDN, so a scan works with no signal", async () => {
    recognize.mockResolvedValue({ data: { text: "" } });
    await readTableImages([image(484, 320)]);

    const options = createWorker.mock.calls[0][2];
    expect(options.workerPath).toBe("/a/worker.min.js");
    expect(options.corePath).toBe("/a/core.js");
    // tesseract appends the language file itself, so it is given the folder.
    expect(options.langPath).toBe("/a/lang");
  });

  it("reads digits and boards only, so a 5 is never an S", async () => {
    recognize.mockResolvedValue({ data: { text: "" } });
    await readTableImages([image(484, 320)]);
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ tessedit_char_whitelist: "0123456789LRAB.- " })
    );
  });

  it("shuts the worker down even when a scan throws", async () => {
    recognize.mockRejectedValue(new Error("wasm died"));
    await expect(readTableImages([image(484, 320)])).rejects.toThrow("wasm died");
    expect(terminate).toHaveBeenCalled();
  });
});
