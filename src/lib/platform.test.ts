import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, catalogOrigins, isNativeApp, shareOrigin, siteUrl, visibleNativePlugins } from "./platform";

const nativeScope = { Capacitor: { isNativePlatform: () => true } };

describe("isNativeApp", () => {
  it("is the store app only when Capacitor's bridge says it is native", () => {
    expect(isNativeApp(nativeScope)).toBe(true);
    // Capacitor's web runtime defines the global too, and answers no.
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(isNativeApp({ Capacitor: {} })).toBe(false);
    expect(isNativeApp({})).toBe(false);
  });

  it("is the web app in the test environment", () => {
    expect(isNativeApp()).toBe(false);
  });
});

describe("siteUrl", () => {
  it("leaves a path alone on the web, so a preview deploy reads its own files", () => {
    expect(siteUrl("/catalog/img/a-thumb.webp", false)).toBe("/catalog/img/a-thumb.webp");
    expect(siteUrl("/catalog/img/a-thumb.webp")).toBe("/catalog/img/a-thumb.webp");
  });

  it("asks headpin.app from the store app, which has no photos of its own", () => {
    expect(siteUrl("/catalog/img/a-thumb.webp", true)).toBe(`${SITE_ORIGIN}/catalog/img/a-thumb.webp`);
  });

  it("returns a full URL, a protocol-relative one and a missing one as they are", () => {
    expect(siteUrl("https://example.com/a.webp", true)).toBe("https://example.com/a.webp");
    expect(siteUrl("//example.com/a.webp", true)).toBe("//example.com/a.webp");
    expect(siteUrl("data:image/png;base64,AAAA", true)).toBe("data:image/png;base64,AAAA");
    expect(siteUrl(null, true)).toBeUndefined();
    expect(siteUrl(undefined, true)).toBeUndefined();
    expect(siteUrl("", true)).toBeUndefined();
  });
});

describe("shareOrigin", () => {
  it("is the page's own origin on the web and headpin.app from the store app", () => {
    expect(shareOrigin(false)).toBe(window.location.origin);
    expect(shareOrigin(true)).toBe(SITE_ORIGIN);
  });
});

describe("catalogOrigins", () => {
  it("reads the web app's own site, and the store app's site before its snapshot", () => {
    expect(catalogOrigins(false)).toEqual([""]);
    expect(catalogOrigins(true)).toEqual([SITE_ORIGIN, ""]);
  });
});

describe("visibleNativePlugins", () => {
  it("names the app's own plugins that the native side announced", () => {
    const scope = { Capacitor: { PluginHeaders: [{ name: "App" }, { name: "HeadpinStore" }] } };
    expect(visibleNativePlugins(scope)).toEqual(["HeadpinStore"]);
    expect(visibleNativePlugins({})).toEqual([]);
  });
});
