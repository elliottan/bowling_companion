import { describe, expect, it } from "vitest";
import { shouldResetScroll } from "./viewportScroll";

describe("shouldResetScroll", () => {
  it("resets the 62px offset iOS leaves after a rotation round-trip", () => {
    expect(shouldResetScroll(62, false)).toBe(true);
  });

  it("leaves an already-zero offset alone", () => {
    expect(shouldResetScroll(0, false)).toBe(false);
  });

  it("resets a negative offset too", () => {
    expect(shouldResetScroll(-62, false)).toBe(true);
  });

  it("ignores sub-pixel jitter rather than fighting the compositor", () => {
    expect(shouldResetScroll(0.4, false)).toBe(false);
    expect(shouldResetScroll(-0.4, false)).toBe(false);
  });

  it("never fights the keyboard scrolling a focused field into view", () => {
    expect(shouldResetScroll(62, true)).toBe(false);
    expect(shouldResetScroll(300, true)).toBe(false);
  });
});
