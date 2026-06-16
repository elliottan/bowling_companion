import { describe, expect, it } from "vitest";
import { derivePinBoard, frontPin } from "./pinGeometry";

describe("pinGeometry", () => {
  it("frontPin is the lowest standing pin number", () => {
    expect(frontPin([6, 10])).toBe(6);
    expect(frontPin([10, 7, 9])).toBe(7);
    expect(frontPin([])).toBeUndefined();
  });

  it("extrapolates the laydown→arrows line to the head pin (60ft, ratio 4)", () => {
    // 20 + (17.5 - 20) * (60/15) = 20 - 10 = 10
    expect(derivePinBoard({ stance: 20, target: 17.5 }, [1])).toBe(10);
  });

  it("uses the front-most pin's depth for a multi-pin leave", () => {
    // 6-10 leave → front pin 6 at 61.73ft, ratio ≈ 4.115
    expect(derivePinBoard({ stance: 20, target: 17.5 }, [10, 6])).toBeCloseTo(9.7, 1);
  });

  it("returns undefined without both stance and target, or with no pins", () => {
    expect(derivePinBoard({ stance: 20 }, [1])).toBeUndefined();
    expect(derivePinBoard({ target: 17.5 }, [1])).toBeUndefined();
    expect(derivePinBoard({ stance: 20, target: 17.5 }, [])).toBeUndefined();
  });

  it("uses laydown as the foul-line board when provided", () => {
    // laydown=20, target=17.5 → same result as stance=20 case
    expect(derivePinBoard({ laydown: 20, target: 17.5 }, [1])).toBe(10);
  });

  it("laydown overrides stance when both present", () => {
    // stance=25 would give 0, laydown=20 should give 10
    expect(derivePinBoard({ stance: 25, laydown: 20, target: 17.5 }, [1])).toBe(10);
  });

  it("returns undefined when neither laydown nor stance is provided", () => {
    expect(derivePinBoard({ target: 17.5 }, [1])).toBeUndefined();
  });
});
