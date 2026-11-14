// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { countLabsTap, LABS_TAP_GAP_MS, LABS_TAPS, readLabsOn, writeLabsOn } from "./labs";

describe("Labs", () => {
  afterEach(() => localStorage.clear());

  it("is off until turned on, and remembered", () => {
    expect(readLabsOn()).toBe(false);
    writeLabsOn(true);
    expect(readLabsOn()).toBe(true);
    writeLabsOn(false);
    expect(readLabsOn()).toBe(false);
  });

  it("toggles on the seventh quick tap and starts over after a pause", () => {
    let state = { count: 0, toggle: false };
    let at = -Infinity;
    for (let i = 1; i < LABS_TAPS; i++) {
      state = countLabsTap(state.count, at, i * 100);
      at = i * 100;
      expect(state.toggle).toBe(false);
    }
    expect(countLabsTap(state.count, at, at + 100)).toEqual({ count: 0, toggle: true });
    expect(countLabsTap(state.count, at, at + LABS_TAP_GAP_MS + 1)).toEqual({ count: 1, toggle: false });
  });
});
