import { describe, expect, it } from "vitest";
import { CHECK_PARAM, hasValidCheck, withCheck } from "./shareCheck";
import { decodeLayoutParams, encodeLayoutParams, DEFAULT_SHARED } from "./layoutShare";
import { decodeLineParams, encodeLineParams } from "./lineShare";

describe("a shared link's check code (ADR-192)", () => {
  it("matches the numbers it was made for, in any order", () => {
    const query = withCheck("da=45&ptp=4.5&val=45");
    const params = new URLSearchParams(query);
    expect(params.get(CHECK_PARAM)).toMatch(/^[0-9a-z]{6}$/);
    expect(hasValidCheck(params)).toBe(true);
    // A chat app that reorders the query does not break it.
    const reordered = new URLSearchParams([...params.entries()].reverse());
    expect(hasValidCheck(reordered)).toBe(true);
  });

  it("opens nothing for a number edited by hand, or for a link without one", () => {
    const shared = encodeLayoutParams(DEFAULT_SHARED);
    expect(decodeLayoutParams(shared)).not.toBeNull();
    expect(decodeLayoutParams(shared.replace("da=45", "da=70"))).toBeNull();
    expect(decodeLayoutParams("da=70&ptp=5&val=30")).toBeNull();

    const line = encodeLineParams({ line: { laydown: 20, target: 15 }, hand: "right" });
    expect(decodeLineParams(line)?.line.target).toBe(15);
    expect(decodeLineParams(line.replace("tg=15", "tg=12"))).toBeNull();
    expect(decodeLineParams("ld=20&tg=12&hand=right")).toBeNull();
  });
});
