import { describe, expect, it } from "vitest";
import { arsenalImageUrls, colorwayImage } from "./ballImages";

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

describe("colorwayImage", () => {
  const path = {
    imageThumb: "/pink-thumb.webp",
    imageFull: "/pink-full.webp",
    colorways: [
      { sku: "PK", color: "Pink/Black" },
      { sku: "OR", color: "Orange/Black" },
      { sku: "BL", color: "Blue", imageThumb: "/blue-thumb.webp", imageFull: "/blue-full.webp" }
    ]
  };

  it("is a colorway's own photo where it has one", () => {
    expect(colorwayImage(path, path.colorways[2], "thumb")).toBe("/blue-thumb.webp");
    expect(colorwayImage(path, path.colorways[2], "full")).toBe("/blue-full.webp");
  });

  it("lends the ball's photo to the first colorway, the one it pictures", () => {
    expect(colorwayImage(path, path.colorways[0], "thumb")).toBe("/pink-thumb.webp");
    expect(colorwayImage(path, path.colorways[0], "full")).toBe("/pink-full.webp");
  });

  it("has no photo for another colorway without its own, so it draws the placeholder", () => {
    expect(colorwayImage(path, path.colorways[1], "thumb")).toBeNull();
    expect(colorwayImage(path, path.colorways[1], "full")).toBeNull();
  });

  it("is the ball's photo with no colorway", () => {
    expect(colorwayImage(path, undefined, "thumb")).toBe("/pink-thumb.webp");
    expect(colorwayImage({ ...path, colorways: undefined }, null, "full")).toBe("/pink-full.webp");
  });
});
