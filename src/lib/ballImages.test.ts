import { describe, expect, it } from "vitest";
import { arsenalImageUrls } from "./ballImages";

const snap = (imageThumb: string | null) => ({
  catalog_snapshot: {
    brand: "Storm",
    name: "Phaze",
    coverstockCategory: null,
    coreName: null,
    rg: null,
    diff: null,
    mbDiff: null,
    imageThumb
  }
});

describe("arsenalImageUrls", () => {
  it("lists each thumbnail once and skips balls without one", () => {
    expect(
      arsenalImageUrls([
        snap("/catalog/img/a-thumb.webp"),
        snap(null),
        { catalog_snapshot: undefined },
        snap("/catalog/img/a-thumb.webp"),
        snap("/catalog/img/b-thumb.webp")
      ])
    ).toEqual(["/catalog/img/a-thumb.webp", "/catalog/img/b-thumb.webp"]);
  });
});
