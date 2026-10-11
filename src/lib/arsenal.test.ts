import { describe, expect, it } from "vitest";
import { activeBalls } from "./arsenal";

describe("activeBalls", () => {
  it("keeps the bag and leaves retired balls out, in order", () => {
    const balls = [{ id: 1 }, { id: 2, retired: true }, { id: 3, retired: false }];
    expect(activeBalls(balls).map((b) => b.id)).toEqual([1, 3]);
  });
});
