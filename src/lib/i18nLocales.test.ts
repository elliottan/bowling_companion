import { describe, expect, it } from "vitest";
import linguiConfigSource from "../../lingui.config.ts?raw";
import infoPlist from "../../ios/App/App/Info.plist?raw";
import androidLocales from "../../android/app/src/main/res/xml/locales_config.xml?raw";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES } from "./i18n";

/**
 * A language is listed in five places, and one missed is a language that half
 * ships: no catalog, or a phone that never offers it (docs/I18N.md, ADR-225).
 */
describe("every list of the app's languages agrees", () => {
  const supported = [...SUPPORTED_LOCALES].sort();

  it("lingui.config.ts extracts a catalog for each, and each catalog exists", () => {
    const block = linguiConfigSource.match(/locales:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const listed = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual(supported);
    const catalogs = Object.keys(import.meta.glob("../locales/*/messages.po")).map(
      (path) => path.split("/")[2]
    );
    expect(catalogs.sort()).toEqual(supported);
  });

  it("the picker names each", () => {
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual(supported);
  });

  it("iOS offers each (CFBundleLocalizations)", () => {
    const block = infoPlist.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? "";
    const listed = [...block.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual(supported);
  });

  it("Android offers each (locales_config.xml)", () => {
    const listed = [...androidLocales.matchAll(/<locale android:name="([^"]+)"/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual(supported);
  });
});
