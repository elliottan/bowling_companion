import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SCALE_DENSE_MAX,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SIZES,
  applyTextSize,
  clampTextScale,
  combinedTextScale,
  denseTextScale,
  isTextSizeId,
  readOsTextScale,
  readTextSize,
  rememberTextSize,
  startTextSize,
  textSizeScale
} from "./textScale";

describe("clampTextScale", () => {
  it("holds a scale between the floor and the ceiling", () => {
    expect(clampTextScale(1)).toBe(1);
    expect(clampTextScale(0.5)).toBe(TEXT_SCALE_MIN);
    expect(clampTextScale(3.1)).toBe(TEXT_SCALE_MAX);
  });

  it("reads anything that is not a positive number as no scaling", () => {
    expect(clampTextScale(Number.NaN)).toBe(1);
    expect(clampTextScale(0)).toBe(1);
    expect(clampTextScale(-2)).toBe(1);
    expect(clampTextScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("combinedTextScale", () => {
  it("multiplies the phone's size by the bowler's", () => {
    expect(combinedTextScale(1, 1)).toBe(1);
    expect(combinedTextScale(1.1, 1.15)).toBeCloseTo(1.265);
  });

  it("never passes the ceiling, however large both are", () => {
    // Accessibility sizes on a phone reach about 3x; the largest in-app size
    // on top of that is still held to the ceiling.
    expect(combinedTextScale(3.1, 1.5)).toBe(TEXT_SCALE_MAX);
    expect(combinedTextScale(1.2, 1.5)).toBe(TEXT_SCALE_MAX);
  });

  it("does not let a small phone size and the default go under the floor", () => {
    expect(combinedTextScale(0.7, 1)).toBe(TEXT_SCALE_MIN);
  });

  it("ignores an unreadable part rather than failing", () => {
    expect(combinedTextScale(Number.NaN, 1.3)).toBe(1.3);
    expect(combinedTextScale(1.2, 0)).toBe(1.2);
  });
});

describe("the in-app sizes", () => {
  it("start at 1 and only grow", () => {
    expect(TEXT_SIZES[0]).toMatchObject({ id: DEFAULT_TEXT_SIZE, scale: 1 });
    const scales = TEXT_SIZES.map((s) => s.scale);
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
    expect(Math.max(...scales)).toBeLessThanOrEqual(TEXT_SCALE_MAX);
  });

  it("look up by id, and an unknown id is the default", () => {
    expect(textSizeScale("larger")).toBe(1.3);
    expect(textSizeScale("huge" as never)).toBe(1);
    expect(isTextSizeId("large")).toBe(true);
    expect(isTextSizeId("huge")).toBe(false);
    expect(isTextSizeId(null)).toBe(false);
  });
});

describe("denseTextScale", () => {
  it("caps a dense surface lower than the page", () => {
    expect(denseTextScale(1)).toBe(1);
    expect(denseTextScale(1.1)).toBe(1.1);
    expect(denseTextScale(TEXT_SCALE_MAX)).toBe(TEXT_SCALE_DENSE_MAX);
    expect(TEXT_SCALE_DENSE_MAX).toBeLessThan(TEXT_SCALE_MAX);
  });
});

describe("the stored size", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--user-text-scale");
    document.documentElement.style.removeProperty("--os-text-scale");
  });

  it("is the default until one is chosen, and ignores a stored junk value", () => {
    expect(readTextSize()).toBe("default");
    localStorage.setItem("textSize", "enormous");
    expect(readTextSize()).toBe("default");
  });

  it("remembers a size, and forgets it when it goes back to the default", () => {
    rememberTextSize("larger");
    expect(localStorage.getItem("textSize")).toBe("larger");
    expect(readTextSize()).toBe("larger");
    rememberTextSize("default");
    expect(localStorage.getItem("textSize")).toBeNull();
  });

  it("is written to the page for the stylesheet to multiply", () => {
    applyTextSize("largest");
    expect(document.documentElement.style.getPropertyValue("--user-text-scale")).toBe("1.5");
    localStorage.setItem("textSize", "large");
    startTextSize();
    expect(document.documentElement.style.getPropertyValue("--user-text-scale")).toBe("1.15");
  });

  it("reads the phone's size from the page, and 1 where nothing wrote one", () => {
    expect(readOsTextScale()).toBe(1);
    document.documentElement.style.setProperty("--os-text-scale", "1.176");
    expect(readOsTextScale()).toBeCloseTo(1.176);
    document.documentElement.style.setProperty("--os-text-scale", "nonsense");
    expect(readOsTextScale()).toBe(1);
  });
});
