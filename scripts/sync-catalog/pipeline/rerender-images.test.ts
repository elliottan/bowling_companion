import { describe, expect, it } from "vitest";

import { NORMALISER } from "./render.js";
import { staleEntries } from "./rerender-images.js";

const entry = (id: string, normaliser?: number) => ({
  imageThumb: `/catalog/img/${id}-thumb.webp`,
  imageFull: `/catalog/img/${id}-full.webp`,
  ...(normaliser ? { normaliser } : {}),
});

describe("staleEntries", () => {
  const images = { old: entry("old"), done: entry("done", NORMALISER) };

  it("takes the photos from before the current treatment", () => {
    expect(staleEntries(images, "all")).toEqual(["old"]);
  });

  it("never takes a photo twice, even when it is named", () => {
    expect(staleEntries(images, ["done", "old", "missing"])).toEqual(["old"]);
  });
});
