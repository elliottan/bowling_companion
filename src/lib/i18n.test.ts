import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { describeAge, describeLastBackup } from "./backupNudge";
import {
  SOURCE_LOCALE,
  SUPPORTED_LOCALES,
  activateLocale,
  activeLocale,
  detectLocale,
  resolveLocale
} from "./i18n";

describe("resolveLocale", () => {
  const supported = ["en", "ja", "pt-BR"];

  it("takes the first preferred language that has a catalog", () => {
    expect(resolveLocale(["fr", "ja", "en"], supported)).toBe("ja");
  });

  it("matches a regional tag to its language's catalog", () => {
    expect(resolveLocale(["ja-JP"], supported)).toBe("ja");
    expect(resolveLocale(["en-GB"], supported)).toBe("en");
  });

  it("prefers a catalog for the region itself when there is one", () => {
    expect(resolveLocale(["pt-BR"], supported)).toBe("pt-BR");
    expect(resolveLocale(["pt_br"], supported)).toBe("pt-BR");
  });

  it("matches Chinese by script: Taiwan, Hong Kong and Macau read Traditional", () => {
    const chinese = ["en", "zh-Hant"];
    expect(resolveLocale(["zh-TW"], chinese)).toBe("zh-Hant");
    expect(resolveLocale(["zh-Hant-TW"], chinese)).toBe("zh-Hant");
    expect(resolveLocale(["zh-HK"], chinese)).toBe("zh-Hant");
    expect(resolveLocale(["zh_MO"], chinese)).toBe("zh-Hant");
    expect(resolveLocale(["zh-Hant"], chinese)).toBe("zh-Hant");
  });

  it("never gives Simplified Chinese the Traditional catalog", () => {
    const chinese = ["en", "ja", "zh-Hant"];
    expect(resolveLocale(["zh-CN", "ja"], chinese)).toBe("ja");
    expect(resolveLocale(["zh-Hans-CN"], chinese)).toBe(SOURCE_LOCALE);
    expect(resolveLocale(["zh"], chinese)).toBe(SOURCE_LOCALE);
  });

  it("falls back to the source language when nothing matches or nothing is asked", () => {
    expect(resolveLocale(["de", "fr"], supported)).toBe(SOURCE_LOCALE);
    expect(resolveLocale([], supported)).toBe(SOURCE_LOCALE);
    expect(resolveLocale(["", "  "], supported)).toBe(SOURCE_LOCALE);
  });

  it("reads the browser's languages, and is English where only English is shipped", () => {
    expect(SUPPORTED_LOCALES).toContain(SOURCE_LOCALE);
    expect(detectLocale()).toBe(SOURCE_LOCALE);
  });
});

describe("activateLocale", () => {
  afterEach(async () => {
    await activateLocale("en");
  });

  it("loads the English catalog lazily and sets the page's language", async () => {
    expect(await activateLocale("en")).toBe("en");
    expect(activeLocale()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ships Japanese: its catalog loads, compiles and answers every message", async () => {
    expect(await activateLocale("ja")).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(describeAge(null, new Date())).not.toBe("never");
    // A catalog missing an entry would show the id; one with a broken plural
    // throws here instead of on a bowler's screen.
    expect(describeLastBackup("2026-06-01T00:00:00.000Z", new Date("2026-06-30T12:00:00Z"))).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
  });

  it.each([
    ["ko", /[\uac00-\ud7af]/],
    ["zh-Hant", /[\u4e00-\u9fff]/]
  ])("ships %s: its catalog loads, compiles and answers", async (locale, script) => {
    expect(await activateLocale(locale)).toBe(locale);
    expect(document.documentElement.lang).toBe(locale);
    expect(describeLastBackup("2026-06-01T00:00:00.000Z", new Date("2026-06-30T12:00:00Z"))).toMatch(script);
  });

  it("falls back to English for a language that has no catalog", async () => {
    expect(await activateLocale("tlh")).toBe("en");
    expect(activeLocale()).toBe("en");
  });

  it("speaks a language once its catalog is loaded: a message is read from the catalog", () => {
    i18n.loadAndActivate({
      locale: "de",
      messages: {
        [generateMessageId("never")]: "nie",
        [generateMessageId("Last backup today")]: "Letzte Sicherung heute"
      }
    });
    expect(describeAge(null, new Date())).toBe("nie");
    const now = new Date("2026-06-30T12:00:00Z");
    expect(describeLastBackup("2026-06-30T00:00:00.000Z", now)).toBe("Letzte Sicherung heute");
  });
});

describe("plurals through the library", () => {
  it("picks the form by the count", () => {
    const now = new Date("2026-06-30T00:00:00Z");
    expect(describeLastBackup("2026-06-29T00:00:00.000Z", now)).toBe("Last backup yesterday");
    expect(describeLastBackup("2026-06-25T00:00:00.000Z", now)).toBe("Last backup 5 days ago");
    expect(describeLastBackup("2026-06-09T00:00:00.000Z", now)).toBe("Last backup 3 weeks ago");
    expect(describeLastBackup("2026-03-30T00:00:00.000Z", now)).toBe("Last backup 3 months ago");
    expect(describeAge("2026-06-16T00:00:00.000Z", now)).toBe("2 weeks ago");
  });
});
