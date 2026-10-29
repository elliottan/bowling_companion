import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { activateLocale } from "./i18n";
import {
  formatAverage,
  formatDate,
  formatFixed,
  formatNumber,
  formatPercent,
  formatRatio
} from "./format";
import { formatReleaseDate, formatSessionDate, formatShortDate } from "./dates";

afterEach(async () => {
  await activateLocale("en");
});

describe("in English", () => {
  it("writes numbers, averages and percents as the app always did", () => {
    expect(formatNumber(187)).toBe("187");
    expect(formatNumber(2.456, 1)).toBe("2.5");
    expect(formatFixed(2.5, 2)).toBe("2.50");
    expect(formatFixed(0.016, 3)).toBe("0.016");
    expect(formatAverage(187.54)).toBe("187.5");
    expect(formatAverage(200)).toBe("200.0");
    expect(formatPercent(73)).toBe("73%");
    expect(formatPercent(72.6)).toBe("73%");
    expect(formatPercent(72.64, 1)).toBe("72.6%");
    expect(formatRatio(3.24)).toBe("3.2:1");
  });

  it("writes dates the way they were", () => {
    expect(formatSessionDate("2026-09-01")).toBe("Sep 1, 2026");
    expect(formatShortDate("2026-10-19", new Date("2026-11-01"))).toBe("Oct 19");
    expect(formatShortDate("2025-10-19", new Date("2026-11-01"))).toBe("Oct 19, 2025");
    expect(formatReleaseDate("2024-03")).toBe("Mar 2024");
  });

  it("leaves what is not a date as it was typed", () => {
    expect(formatSessionDate("league night")).toBe("league night");
  });
});

describe("in another language", () => {
  async function speak(locale: string) {
    i18n.loadAndActivate({ locale, messages: {} });
  }

  it("follows the language's own separators", async () => {
    await speak("de");
    expect(formatAverage(187.5)).toBe("187,5");
    expect(formatFixed(22.4, 2)).toBe("22,40");
    // A narrow no-break space before the sign, as German writes it.
    expect(formatPercent(73).replace(/\s/g, " ")).toBe("73 %");
    expect(formatRatio(3.2)).toBe("3,2:1");
  });

  it("writes a date in that language", async () => {
    await speak("de");
    expect(formatSessionDate("2026-09-01")).toMatch(/1\. Sept\.? 2026/);
    expect(formatDate(new Date(2026, 8, 1), { month: "long" })).toBe("September");
  });

  it("builds a formatter per language, so switching does not reuse the last one", async () => {
    expect(formatAverage(1.5)).toBe("1.5");
    await speak("de");
    expect(formatAverage(1.5)).toBe("1,5");
    await speak("en");
    expect(formatAverage(1.5)).toBe("1.5");
  });
});
