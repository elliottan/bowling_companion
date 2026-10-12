import { describe, expect, it } from "vitest";

import { nextStem } from "./set-ball-image.js";

describe("nextStem", () => {
  it("gives a ball with no photo its plain name", () => {
    expect(nextStem("motiv-venom", undefined)).toBe("motiv-venom");
  });

  it("renames a replaced photo so the 30-day cache lets it through", () => {
    expect(nextStem("motiv-venom", "/catalog/img/motiv-venom-full.webp")).toBe("motiv-venom-p2");
    expect(nextStem("motiv-venom", "/catalog/img/motiv-venom-p2-full.webp")).toBe("motiv-venom-p3");
  });

  it("does not mistake a name ending in p and a digit for a version", () => {
    expect(nextStem("x-mp3", "/catalog/img/x-mp3-full.webp")).toBe("x-mp3-p2");
  });
});
