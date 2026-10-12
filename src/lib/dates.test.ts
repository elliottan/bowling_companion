import { describe, expect, it } from "vitest";
import { formatReleaseDate, formatSessionDate, localDateKey } from "./dates";

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

describe("formatReleaseDate", () => {
  const march2024 = new Date(2024, 2, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  it("says the month and year of a dated release, never the day", () => {
    expect(formatReleaseDate("2024-03-28")).toBe(march2024);
    expect(formatReleaseDate("2024-03")).toBe(march2024);
  });

  it("says only the year when that is all the source gave", () => {
    expect(formatReleaseDate("2024")).toBe("2024");
  });

  it("is null for no date or one that does not parse", () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate(undefined)).toBeNull();
    expect(formatReleaseDate("")).toBeNull();
    expect(formatReleaseDate("March 2024")).toBeNull();
  });

  it("falls back to the year for a month that is not one", () => {
    expect(formatReleaseDate("2024-13")).toBe("2024");
  });
});
