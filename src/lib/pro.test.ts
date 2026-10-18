import { afterEach, describe, expect, it } from "vitest";
import { APP_STORE_URL, FREE_APP_PATH, PRO_OPEN, isOwnerPath, openAppStore, webProAccess } from "./pro";

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
