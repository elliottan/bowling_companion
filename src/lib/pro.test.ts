import { afterEach, describe, expect, it } from "vitest";
import { APP_STORE_URL, FREE_APP_PATH, PRO_OPEN, appProAccess, appStoreId, isFreeAppPath, isOwnerPath, openAppStore, webProAccess } from "./pro";
import { LOCK_FREE_WEB } from "./appStore";

describe("webProAccess", () => {
  it("keeps everything open until the app is listed", () => {
    // Shipped open. Locking anything is a deliberate edit, made when the iOS
    // app goes live, not a default (ADR-154).
    expect(APP_STORE_URL).toBeNull();
    expect(webProAccess()).toEqual(PRO_OPEN);
    expect(webProAccess(null)).toEqual({ locked: false });
  });

  it("locks the Pro parts on the free app, pointing at the App Store, once there is an app to get", () => {
    expect(webProAccess("https://apps.apple.com/app/id1", FREE_APP_PATH)).toEqual({
      locked: true,
      appStoreUrl: "https://apps.apple.com/app/id1"
    });
  });

  it("locks /app before the app is listed, with nowhere to send a bowler yet (ADR-166)", () => {
    expect(LOCK_FREE_WEB).toBe(true);
    for (const path of ["/app", "/app/", "/app/index.html"]) {
      expect(webProAccess(null, path)).toEqual({ locked: true, appStoreUrl: null });
    }
    expect(isFreeAppPath("/apple")).toBe(false);
    // Nowhere else: the owner's copy, the Android app and a stray address stay open.
    expect(webProAccess(null, "/score")).toEqual(PRO_OPEN);
    expect(webProAccess(null, "/")).toEqual(PRO_OPEN);
  });

  it("leaves /app open when the lock is switched off", () => {
    expect(webProAccess(null, "/app", false)).toEqual(PRO_OPEN);
  });

  it("keeps everything open at the owner's address, whatever is listed", () => {
    for (const path of ["/score", "/score/", "/score/index.html"]) {
      expect(webProAccess("https://apps.apple.com/app/id1", path)).toEqual(PRO_OPEN);
    }
    // A path that only starts with the same letters is not the owner's.
    expect(isOwnerPath("/scores")).toBe(false);
    expect(isOwnerPath(FREE_APP_PATH)).toBe(false);
  });
});

describe("openAppStore", () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { value: original, configurable: true });
  });

  it("hands the link to the platform rather than opening a tab", () => {
    const location = { href: "" };
    Object.defineProperty(window, "location", { value: location, configurable: true });
    openAppStore("https://apps.apple.com/app/id1");
    expect(location.href).toBe("https://apps.apple.com/app/id1");
  });
});

describe("appStoreId", () => {
  it("reads the numeric id from an App Store URL", () => {
    expect(appStoreId("https://apps.apple.com/us/app/headpin/id6740000001")).toBe("6740000001");
  });

  it("has none until the app is listed", () => {
    expect(appStoreId(null)).toBeNull();
    expect(appStoreId("https://headpin.app")).toBeNull();
  });
});

describe("appProAccess", () => {
  const store = { owned: false, price: "$9.99", buy: async () => "purchased" as const, restore: async () => false };

  it("locks with the purchase until this Apple ID owns Pro", () => {
    expect(appProAccess(store)).toEqual({ locked: true, store });
  });

  it("opens everything once Pro is owned", () => {
    expect(appProAccess({ ...store, owned: true })).toEqual({ locked: false, owned: true });
  });

  it("answers as the web does where nothing sells Pro", () => {
    expect(appProAccess(null)).toEqual(webProAccess());
  });
});
