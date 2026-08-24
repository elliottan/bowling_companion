import { describe, expect, it } from "vitest";
import { INITIAL_NAV, navReducer, type NavState } from "./appNavigation";
import {
  HOME_ROUTE,
  formatRoute,
  parseRoute,
  routeHash,
  shouldPushHistory,
  toRoute,
  type AppRoute
} from "./appRoute";

const nav = (over: Partial<NavState> = {}): NavState => ({ ...INITIAL_NAV, ...over });

describe("appRoute", () => {
  const cases: Array<[string, AppRoute]> = [
    ["#/home", { view: "dashboard", overlays: [] }],
    ["#/history", { view: "history", overlays: [] }],
    ["#/stats", { view: "stats", overlays: [] }],
    ["#/stats/open-frames", { view: "stats", overlays: ["open-frames"] }],
    ["#/stats/game-trend", { view: "stats", overlays: ["game-trend"] }],
    ["#/home/spares", { view: "dashboard", overlays: ["spares"] }],
    ["#/settings", { view: "settings", overlays: [] }],
    ["#/settings/lanes", { view: "settings", settingsSection: "lanes", overlays: [] }],
    ["#/session/12", { view: "active", sessionId: 12, overlays: [] }],
    ["#/home/arsenal", { view: "dashboard", overlays: ["arsenal"] }],
    ["#/home/arsenal/catalog", { view: "dashboard", overlays: ["arsenal", "catalog"] }],
    ["#/home/line", { view: "dashboard", overlays: [], lineSandbox: true }],
    ["#/session/3/catalog/line", { view: "active", sessionId: 3, overlays: ["catalog"], lineSandbox: true }]
  ];

  it.each(cases)("round-trips %s", (hash, route) => {
    expect(formatRoute(route)).toBe(hash);
    expect(parseRoute(hash)).toEqual(route);
  });

  it("keeps the settings menu implicit, since it is the settings screen itself", () => {
    expect(formatRoute({ view: "settings", settingsSection: "menu", overlays: [] })).toBe("#/settings");
    expect(parseRoute("#/settings/menu")).toEqual({ view: "settings", overlays: [] });
  });

  it("drops a session id that could not be one", () => {
    expect(parseRoute("#/session/abc")).toEqual({ view: "active", overlays: [] });
    expect(parseRoute("#/session/0")).toEqual({ view: "active", overlays: [] });
  });

  it("falls back to the dashboard rather than throwing on an unreadable hash", () => {
    for (const hash of ["", "#", "#/", "#/nonsense", "#/nonsense/arsenal"]) {
      expect(parseRoute(hash)).toEqual(HOME_ROUTE);
    }
  });

  it("ignores segments it does not know instead of stranding the user", () => {
    expect(parseRoute("#/home/wat/arsenal")).toEqual({ view: "dashboard", overlays: ["arsenal"] });
    expect(parseRoute("#/settings/not-a-section")).toEqual({ view: "settings", overlays: [] });
  });

  describe("projecting navigation state", () => {
    it("writes down where the user is", () => {
      expect(routeHash(nav({ view: "history" }))).toBe("#/history");
      expect(routeHash(nav({ view: "active", activeSessionId: 8 }))).toBe("#/session/8");
      expect(routeHash(nav({ view: "settings", settingsSection: "backup" }))).toBe("#/settings/backup");
      expect(routeHash(nav({ overlays: ["arsenal", "catalog"] }))).toBe("#/home/arsenal/catalog");
      expect(routeHash(nav({ lineSandboxOpen: true }))).toBe("#/home/line");
    });

    it("leaves session memory out of the URL", () => {
      // previousView and the one-shot stats flag are not places.
      const state = nav({ view: "history", previousView: "stats", openSessionStats: true });
      expect(toRoute(state)).toEqual({ view: "history", overlays: [] });
    });

    it("omits a session id when the session tab holds no session", () => {
      expect(routeHash(nav({ view: "active" }))).toBe("#/session");
    });

    it("survives the round trip back through the reducer", () => {
      const state = nav({ view: "settings", settingsSection: "lanes", overlays: ["catalog"] });
      const restored = navReducer(INITIAL_NAV, { type: "restore", route: parseRoute(routeHash(state)) });
      expect(routeHash(restored)).toBe(routeHash(state));
      expect(restored.settingsSection).toBe("lanes");
      expect(restored.overlays).toEqual(["catalog"]);
    });
  });

  describe("shouldPushHistory", () => {
    it("pushes for things the user navigated into", () => {
      const home = nav();
      expect(shouldPushHistory(home, nav({ overlays: ["arsenal"] }))).toBe(true);
      expect(shouldPushHistory(nav({ overlays: ["arsenal"] }), nav({ overlays: ["arsenal", "catalog"] }))).toBe(true);
      expect(shouldPushHistory(home, nav({ lineSandboxOpen: true }))).toBe(true);
      expect(shouldPushHistory(home, nav({ view: "active", activeSessionId: 4 }))).toBe(true);
      expect(shouldPushHistory(
        nav({ view: "settings" }),
        nav({ view: "settings", settingsSection: "lanes" })
      )).toBe(true);
    });

    it("does not push for a tab switch, which nobody uses back for", () => {
      expect(shouldPushHistory(nav(), nav({ view: "history" }))).toBe(false);
      expect(shouldPushHistory(nav({ view: "history" }), nav({ view: "settings" }))).toBe(false);
    });

    it("does not push on the way back out", () => {
      expect(shouldPushHistory(nav({ overlays: ["arsenal"] }), nav())).toBe(false);
      expect(shouldPushHistory(nav({ lineSandboxOpen: true }), nav())).toBe(false);
      expect(shouldPushHistory(
        nav({ view: "settings", settingsSection: "lanes" }),
        nav({ view: "settings" })
      )).toBe(false);
    });

    it("does not push when swapping session inside the session tab", () => {
      expect(shouldPushHistory(
        nav({ view: "active", activeSessionId: 1 }),
        nav({ view: "active", activeSessionId: 2 })
      )).toBe(false);
    });
  });

  describe("restore", () => {
    it("clears an overlay stack the URL does not mention", () => {
      const open = nav({ overlays: ["arsenal", "catalog"] });
      const restored = navReducer(open, { type: "restore", route: parseRoute("#/home") });
      expect(restored.overlays).toEqual([]);
      expect(restored.lineSandboxOpen).toBe(false);
    });

    it("keeps the open session when the URL names the tab without an id", () => {
      const inSession = nav({ view: "active", activeSessionId: 5 });
      const restored = navReducer(inSession, { type: "restore", route: parseRoute("#/session") });
      expect(restored.activeSessionId).toBe(5);
    });

    it("drops the active session when restoring onto another tab", () => {
      const inSession = nav({ view: "active", activeSessionId: 5 });
      const restored = navReducer(inSession, { type: "restore", route: parseRoute("#/history") });
      expect(restored.view).toBe("history");
      expect(restored.activeSessionId).toBeNull();
    });

    it("leaves back pointing at the restored tab", () => {
      const restored = navReducer(nav({ previousView: "stats" }), {
        type: "restore",
        route: parseRoute("#/history")
      });
      expect(restored.previousView).toBe("history");
    });
  });
});
