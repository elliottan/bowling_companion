import { describe, it, expect } from "vitest";
import { decodeLineParams, encodeLineParams, lineShareUrl, LINE_SANDBOX_HASH } from "./lineShare";
import type { SharedLine } from "./lineShare";

const A_LINE: SharedLine = {
  line: {
    laydown: 20,
    target: 15,
    final_board: 17.5,
    hook_start_distance: 42,
    hook_length: 12
  },
  hand: "right",
  patternCatalogId: "chromium-6742"
};

describe("encode and decode", () => {
  it("round-trips a whole shared line", () => {
    const back = decodeLineParams(encodeLineParams(A_LINE));
    expect(back).toEqual(A_LINE);
  });

  it("round-trips a spare line with its leave", () => {
    const spare: SharedLine = {
      line: { laydown: 25, target: 10, final_board: 3, final_distance: 60 },
      hand: "left",
      spare: true,
      leave: [6, 10]
    };
    expect(decodeLineParams(encodeLineParams(spare))).toEqual(spare);
  });

  it("writes a laydown for a line that only has a stance", () => {
    expect(encodeLineParams({ line: { stance: 22, target: 12 }, hand: "right" })).toContain("ld=22");
  });

  it("says nothing about a line for a query that carries none", () => {
    expect(decodeLineParams("")).toBeNull();
    expect(decodeLineParams("?utm_source=chat")).toBeNull();
  });

  it("opens on what it can read rather than failing on what it cannot", () => {
    const back = decodeLineParams("?ld=oops&tg=15");
    expect(back?.line).toEqual({ target: 15 });
    expect(back?.hand).toBe("right");
  });

  it("clamps a hand-edited board back onto the lane", () => {
    expect(decodeLineParams("?tg=900")?.line.target).toBe(39);
    expect(decodeLineParams("?tg=-4")?.line.target).toBe(1);
  });

  it("drops pins that are not pins, and a leave of nothing", () => {
    expect(decodeLineParams("?lv=6.10.99")?.leave).toEqual([6, 10]);
    expect(decodeLineParams("?lv=xx")?.leave).toBeUndefined();
  });

  it("reads a leave as a spare line even with the flag gone", () => {
    expect(decodeLineParams("?lv=7")?.spare).toBe(true);
  });

  it("carries the pattern as a catalog id, never a name", () => {
    const params = encodeLineParams(A_LINE);
    expect(params).toContain("pat=chromium-6742");
    expect(params).not.toContain("Chromium");
  });

  it("leaves a pattern of the bowler's own out of the link", () => {
    // No catalog id: its load table lives on one device, so there is nothing
    // the far end could draw from a name.
    expect(encodeLineParams({ ...A_LINE, patternCatalogId: undefined })).not.toContain("pat=");
  });
});

describe("the shareable URL", () => {
  it("puts the line in the query and the sandbox in the hash", () => {
    const url = lineShareUrl(A_LINE, "https://headpin.app", "/score");
    expect(url.startsWith("https://headpin.app/score?")).toBe(true);
    expect(url.endsWith(LINE_SANDBOX_HASH)).toBe(true);
    expect(decodeLineParams(url.slice(url.indexOf("?"), url.indexOf("#")))).toEqual(A_LINE);
  });

  it("opens wherever it was shared from, not a hardcoded host", () => {
    expect(lineShareUrl(A_LINE, "https://preview.example", "/")).toContain("https://preview.example/");
  });
});
