import { describe, expect, it } from "vitest";
import { applyGesture, modeFor } from "./pinGesture";
import type { PinNumber } from "../types/bowling";

const pins = (...ns: PinNumber[]): PinNumber[] => ns;

describe("pin gesture", () => {
  it("select mode adds a pin not yet standing", () => {
    expect(applyGesture(pins(), "select", 7)).toEqual([7]);
  });

  it("select mode leaves an already-standing pin unchanged", () => {
    const start = pins(7);
    const next = applyGesture(start, "select", 7);
    expect(next).toBe(start); // same reference -> no-op, no re-render
  });

  it("deselect mode removes a standing pin", () => {
    expect(applyGesture(pins(7, 10), "deselect", 10)).toEqual([7]);
  });

  it("deselect mode leaves an already-down pin unchanged", () => {
    const start = pins(7);
    const next = applyGesture(start, "deselect", 10);
    expect(next).toBe(start);
  });

  it("keeps the result sorted", () => {
    expect(applyGesture(pins(10), "select", 2)).toEqual([2, 10]);
  });

  it("modeFor derives mode from the first pin's current state", () => {
    expect(modeFor(pins(), 7)).toBe("select"); // pin down -> first tap raises
    expect(modeFor(pins(7), 7)).toBe("deselect"); // pin standing -> first tap lowers
  });
});
