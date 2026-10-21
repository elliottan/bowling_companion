import { describe, expect, it } from "vitest";
import plist from "../../ios/App/App/Info.plist?raw";
import { inAppLocation } from "./deepLink";
import { parseRoute } from "./appRoute";

/**
 * The iPhone app's Home Screen quick actions (ADR-168) live in Info.plist as
 * headpin.app addresses, and reach the page the way a shared link does. Nothing
 * on the Swift side checks them, so this does: each must be a link the app
 * claims, and must open the screen its title names.
 */
function quickActions(): Array<{ title: string; url: string }> {
  const block = /<key>UIApplicationShortcutItems<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? "";
  return [...block.matchAll(/<dict>([\s\S]*?)<\/dict>\s*<\/dict>/g)].map(([, item]) => ({
    title: /UIApplicationShortcutItemTitle<\/key>\s*<string>([^<]*)</.exec(item)?.[1] ?? "",
    url: /<key>url<\/key>\s*<string>([^<]*)</.exec(item)?.[1] ?? ""
  }));
}

describe("the iPhone app's quick actions", () => {
  const actions = quickActions();

  it("are listed", () => {
    expect(actions.map((a) => a.title)).toEqual(["Stats", "History", "Arsenal", "Ball catalog"]);
  });

  it("each open the screen they name", () => {
    const routes = actions.map(({ url }) => {
      const location = inAppLocation(url);
      expect(location, url).not.toBeNull();
      return parseRoute(new URL(location!, "https://x").hash);
    });
    expect(routes).toEqual([
      { view: "stats", overlays: [] },
      { view: "history", overlays: [] },
      { view: "dashboard", overlays: ["arsenal"] },
      { view: "dashboard", overlays: ["catalog"] }
    ]);
  });
});
