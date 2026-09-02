import { describe, expect, it } from "vitest";
import { formatSessionDate, localDateKey } from "./dates";

describe("localDateKey", () => {
  it("files the day the device is on, not the UTC day", () => {
    // 23:30 local is often already tomorrow in UTC. The stored key must be
    // the day the bowler is living in.
    const lateEvening = new Date(2026, 8, 1, 23, 30);
    expect(localDateKey(lateEvening)).toBe("2026-09-01");
  });

  it("pads month and day", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through formatSessionDate without shifting a day", () => {
    const key = localDateKey(new Date(2026, 8, 1, 0, 10));
    expect(formatSessionDate(key)).toContain("1");
    expect(formatSessionDate(key)).toContain("2026");
  });
});
