import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inAppLocation } from "../lib/deepLink";

/**
 * headpin.app vouches for the iPhone app (ADR-159). iOS reads
 * `/.well-known/apple-app-site-association` when the app is installed and
 * hands a link to the app only when the file names the app exactly: the team
 * that signs it and its bundle id. A typo there fails silently, every link
 * opening in Safari, so the file is held to the Xcode project here.
 */
const root = join(__dirname, "..", "..");
const aasa = JSON.parse(readFileSync(join(root, "public/.well-known/apple-app-site-association"), "utf8"));
const project = readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
const entitlements = readFileSync(join(root, "ios/App/App/App.entitlements"), "utf8");

const detail = aasa.applinks.details[0];
type Component = { "/": string; exclude?: boolean };
const components: Component[] = detail.components;

/** Whether a path is claimed, read as iOS reads the components: the first
 *  that matches wins, and `*` matches anything. */
function claimed(path: string): boolean {
  const hit = components.find((c) => new RegExp(`^${c["/"].replace(/\*/g, ".*")}$`).test(path));
  return hit !== undefined && !hit.exclude;
}

describe("apple-app-site-association", () => {
  it("names the app the project signs", () => {
    const team = /DEVELOPMENT_TEAM = (\w+);/.exec(project)?.[1];
    const bundle = /PRODUCT_BUNDLE_IDENTIFIER = ([\w.]+);/.exec(project)?.[1];
    expect(detail.appIDs).toEqual([`${team}.${bundle}`]);
    expect(entitlements).toContain("applinks:headpin.app");
  });

  it("claims the free app and the guides, and leaves the owner's copy on the web", () => {
    for (const path of ["/app", "/app/", "/guides/spare-shooting"]) expect(claimed(path)).toBe(true);
    for (const path of ["/score", "/score/", "/", "/legal"]) expect(claimed(path)).toBe(false);
  });

  it("claims only links the app can open", () => {
    for (const path of ["/app", "/guides/spare-shooting"]) {
      expect(inAppLocation(`https://headpin.app${path}`)).not.toBeNull();
    }
  });
});
