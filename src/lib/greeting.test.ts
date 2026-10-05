import { describe, expect, it } from "vitest";
import { GREETINGS, greeting } from "./greeting";

describe("the Home greeting", () => {
  it("puts the name on the end when there is one", () => {
    expect(greeting("Sam", 0)).toBe(`${GREETINGS[0]}, Sam`);
    expect(greeting("  Sam  ", 2)).toBe(`${GREETINGS[2]}, Sam`);
  });

  it("is the greeting alone without a name", () => {
    expect(greeting(null, 1)).toBe(GREETINGS[1]);
    expect(greeting("   ", 1)).toBe(GREETINGS[1]);
  });

  it("wraps any index onto the list", () => {
    expect(greeting(null, GREETINGS.length)).toBe(GREETINGS[0]);
    expect(greeting(null, -1)).toBe(GREETINGS[GREETINGS.length - 1]);
  });

  it("keeps every greeting extremely short", () => {
    for (const g of GREETINGS) expect(g.split(" ").length).toBeLessThanOrEqual(3);
  });
});
