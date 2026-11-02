import { describe, expect, it } from "vitest";
import linguiConfigSource from "../../lingui.config.ts?raw";
import infoPlist from "../../ios/App/App/Info.plist?raw";
import androidLocales from "../../android/app/src/main/res/xml/locales_config.xml?raw";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES } from "./i18n";

const infoPlistStrings = import.meta.glob("../../ios/App/App/*.lproj/InfoPlist.strings", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

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

  it("iOS translates the Info.plist text for each (InfoPlist.strings)", () => {
    // The Home Screen quick actions and the Photos prompt are read from
    // Info.plist by iOS, not from a catalog, so each language has its own
    // InfoPlist.strings, keyed by the English, listed in the Xcode project.
    const titles = [...infoPlist.matchAll(/<key>UIApplicationShortcutItemTitle<\/key>\s*<string>([^<]+)<\/string>/g)].map(
      (m) => m[1]
    );
    expect(titles.length).toBeGreaterThan(0);
    const keys = [...titles, "NSPhotoLibraryAddUsageDescription"];
    const translated = Object.keys(infoPlistStrings)
      .map((path) => path.split("/").slice(-2, -1)[0].replace(".lproj", ""))
      .sort();
    expect(translated).toEqual(supported.filter((l) => l !== "en"));
    for (const [path, text] of Object.entries(infoPlistStrings)) {
      for (const key of keys) expect(text, path).toMatch(new RegExp(`^"${key}" = "[^"]+";$`, "m"));
    }
  });
});
