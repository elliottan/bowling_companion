import { describe, expect, it } from "vitest";

import { brandFromSlug, cleanName } from "./parse-bowwwl.js";

describe("brandFromSlug", () => {
  it("title-cases a slug into the catalog's brand name", () => {
    expect(brandFromSlug("roto-grip")).toBe("Roto Grip");
    expect(brandFromSlug("900-global")).toBe("900 Global");
    expect(brandFromSlug("columbia-300")).toBe("Columbia 300");
    expect(brandFromSlug("storm")).toBe("Storm");
  });

  it("spells DV8 the way the catalog does", () => {
    expect(brandFromSlug("dv8")).toBe("DV8");
  });
});

describe("cleanName", () => {
  it("drops the note that a ball is sold in many colours", () => {
    expect(cleanName("Path (various colors)")).toBe("Path");
  });

  it("moves a cover named in that note in front, as part of the name", () => {
    expect(cleanName("Rhino (pearl, various colors)")).toBe("Rhino Pearl");
    expect(cleanName("Tropical Surge (Pearl, Various Colors)")).toBe("Tropical Surge Pearl");
  });

  it("drops a trailing colour description of one colourway", () => {
    expect(cleanName("Hustle ETF (Electric Blue Teal Fuchsia)")).toBe("Hustle ETF");
  });

  it("leaves a plain name alone", () => {
    expect(cleanName("Black Widow 3.0")).toBe("Black Widow 3.0");
  });
});
