import { describe, expect, it } from "vitest";
import { appStoreId, pointLandingAtStore } from "./appStore";

const URL = "https://apps.apple.com/app/headpin/id1234567890";

describe("appStoreId", () => {
  it("reads the numeric id from an App Store URL", () => {
    expect(appStoreId(URL)).toBe("1234567890");
  });

  it("is null with no App Store page", () => {
    expect(appStoreId(null)).toBeNull();
  });
});

describe("pointLandingAtStore", () => {
  const page = [
    '<a class="open" href="/app" data-store><span data-store-label="Get the app">Open app</span></a>',
    '<a class="cta" href="/app" data-store><span data-store-label="Free on the App Store" data-web-label="Open Headpin">Open Headpin</span></a>',
    '<a href="/app">Plain link</a>',
    "<!--store:web--><div>Add it to your home screen</div><!--/store:web-->",
    '<!--store:app <a href="{appStoreUrl}">Get it on the App Store</a> -->'
  ].join("\n");

  it("leaves the page on the web app while there is no App Store page", () => {
    expect(pointLandingAtStore(page, null)).toBe(page);
  });

  it("points the marked buttons at the App Store, in their App Store words", () => {
    const out = pointLandingAtStore(page, URL);
    expect(out).toContain(`<a class="open" href="${URL}" data-store><span data-store-label="Get the app">Get the app</span></a>`);
    expect(out).toContain(
      `<a class="cta" href="${URL}" data-store><span data-store-label="Free on the App Store" data-web-label="Open Headpin">Free on the App Store</span></a>`
    );
  });

  it("leaves an unmarked link to the web app alone", () => {
    expect(pointLandingAtStore(page, URL)).toContain('<a href="/app">Plain link</a>');
  });

  it("drops what is only for the web app and shows what is only for the App Store", () => {
    const out = pointLandingAtStore(page, URL);
    expect(out).not.toContain("home screen");
    expect(out).not.toContain("store:");
    expect(out).toContain(`<a href="${URL}">Get it on the App Store</a>`);
  });
});
