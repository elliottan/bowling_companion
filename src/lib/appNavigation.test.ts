import { describe, expect, it } from "vitest";
import { INITIAL_NAV, navReducer, type NavAction, type NavState } from "./appNavigation";

/** Apply a sequence of actions, the way a user's taps arrive. */
function run(actions: NavAction[], from: NavState = INITIAL_NAV): NavState {
  return actions.reduce(navReducer, from);
}

describe("navReducer", () => {
  describe("tabs", () => {
    it("switches tab", () => {
      expect(run([{ type: "goTo", view: "history" }]).view).toBe("history");
    });

    it("entering Settings from the tab bar starts at its menu", () => {
      const state = run([
        { type: "goToSettingsSection", section: "lanes" },
        { type: "goTo", view: "history" },
        { type: "goTo", view: "settings" }
      ]);
      expect(state.settingsSection).toBe("menu");
    });

    it("a shortcut jumps straight to a section", () => {
      const state = run([{ type: "goToSettingsSection", section: "lanes" }]);
      expect(state.view).toBe("settings");
      expect(state.settingsSection).toBe("lanes");
    });

    it("leaves the section alone when moving between other tabs", () => {
      const state = run([
        { type: "goToSettingsSection", section: "oil-patterns" },
        { type: "goTo", view: "stats" }
      ]);
      expect(state.settingsSection).toBe("oil-patterns");
    });
  });

  describe("the active session", () => {
    it("returns to the tab it was entered from, not always the dashboard", () => {
      const state = run([
        { type: "goTo", view: "history" },
        { type: "openSession", sessionId: 7 },
        { type: "leaveSession" }
      ]);
      expect(state.view).toBe("history");
    });

    it("keeps that origin tab when reopening a session from within the session", () => {
      const state = run([
        { type: "goTo", view: "history" },
        { type: "openSession", sessionId: 7 },
        // Opening another session while already in one must not make "active"
        // the tab we return to, which would trap the user in the session view.
        { type: "openSession", sessionId: 9 },
        { type: "leaveSession" }
      ]);
      expect(state.view).toBe("history");
    });

    it("goTo('active') from a tab records that tab too", () => {
      const state = run([
        { type: "goTo", view: "stats" },
        { type: "goTo", view: "active" },
        { type: "leaveSession" }
      ]);
      expect(state.view).toBe("stats");
    });

    it("opens a finished session with its stats up, once", () => {
      const opened = run([{ type: "openSession", sessionId: 3, openStats: true }]);
      expect(opened.openSessionStats).toBe(true);

      const consumed = navReducer(opened, { type: "statsOpened" });
      expect(consumed.openSessionStats).toBe(false);
      // Already consumed: the same state comes back, so a remount cannot
      // re-open the sheet.
      expect(navReducer(consumed, { type: "statsOpened" })).toBe(consumed);
    });

    it("carries the ball a drill-down was about, and drops it with the game", () => {
      const opened = run([{ type: "openSession", sessionId: 3, gameId: 9, ballId: 4 }]);
      expect(opened.openSessionBallId).toBe(4);

      const consumed = navReducer(opened, { type: "sessionGameOpened" });
      expect(consumed.openSessionBallId).toBeNull();
      expect(navReducer(consumed, { type: "sessionGameOpened" })).toBe(consumed);
    });

    it("opens a named game of a session, once", () => {
      const opened = run([{ type: "openSession", sessionId: 3, gameId: 9 }]);
      expect(opened.view).toBe("active");
      expect(opened.activeSessionId).toBe(3);
      expect(opened.openSessionGameId).toBe(9);

      const consumed = navReducer(opened, { type: "sessionGameOpened" });
      expect(consumed.openSessionGameId).toBeNull();
      // Consumed: a remount cannot yank the scorer back to that game.
      expect(navReducer(consumed, { type: "sessionGameOpened" })).toBe(consumed);
    });

    it("opening a session without a game clears a previous one", () => {
      const state = run([
        { type: "openSession", sessionId: 3, gameId: 9 },
        { type: "openSession", sessionId: 4 }
      ]);
      expect(state.openSessionGameId).toBeNull();
    });

    it("a launch-time resumable game opens straight into scoring", () => {
      const state = run([{ type: "resumeAvailable", sessionId: 42 }]);
      expect(state.view).toBe("active");
      expect(state.activeSessionId).toBe(42);
    });
  });

  describe("deleting a session", () => {
    it("drops out of the session that was open", () => {
      const state = run([
        { type: "goTo", view: "history" },
        { type: "openSession", sessionId: 7 },
        { type: "sessionDeleted", sessionId: 7 }
      ]);
      expect(state.activeSessionId).toBeNull();
      expect(state.view).toBe("history");
    });

    it("leaves navigation alone when another session is deleted", () => {
      const before = run([{ type: "openSession", sessionId: 7 }]);
      expect(navReducer(before, { type: "sessionDeleted", sessionId: 8 })).toBe(before);
    });

    it("clears the open session deleted from another tab without moving the user", () => {
      const state = run([
        { type: "openSession", sessionId: 7 },
        { type: "goTo", view: "history" },
        { type: "sessionDeleted", sessionId: 7 }
      ]);
      expect(state.activeSessionId).toBeNull();
      expect(state.view).toBe("history");
    });
  });

  describe("the overlay stack", () => {
    it("pushes and pops one level at a time", () => {
      const stacked = run([
        { type: "pushOverlay", overlay: "arsenal" },
        { type: "pushOverlay", overlay: "catalog" }
      ]);
      expect(stacked.overlays).toEqual(["arsenal", "catalog"]);

      const popped = navReducer(stacked, { type: "popOverlay" });
      expect(popped.overlays).toEqual(["arsenal"]);
      expect(navReducer(popped, { type: "popOverlay" }).overlays).toEqual([]);
    });

    it("ignores a re-push of the overlay already on top", () => {
      const open = run([{ type: "pushOverlay", overlay: "arsenal" }]);
      expect(navReducer(open, { type: "pushOverlay", overlay: "arsenal" })).toBe(open);
    });

    it("allows the same overlay again from a different one", () => {
      const state = run([
        { type: "pushOverlay", overlay: "arsenal" },
        { type: "pushOverlay", overlay: "catalog" },
        { type: "pushOverlay", overlay: "arsenal" }
      ]);
      expect(state.overlays).toEqual(["arsenal", "catalog", "arsenal"]);
    });

    it("popping an empty stack stays empty", () => {
      expect(navReducer(INITIAL_NAV, { type: "popOverlay" }).overlays).toEqual([]);
    });

    it("survives a tab switch, since the tab is underneath it", () => {
      const state = run([
        { type: "pushOverlay", overlay: "catalog" },
        { type: "goTo", view: "stats" }
      ]);
      expect(state.overlays).toEqual(["catalog"]);
    });

    it("opens and closes the line sandbox independently of the stack", () => {
      const open = run([
        { type: "pushOverlay", overlay: "arsenal" },
        { type: "openLineSandbox" }
      ]);
      expect(open.lineSandboxOpen).toBe(true);
      expect(open.overlays).toEqual(["arsenal"]);

      const closed = navReducer(open, { type: "closeLineSandbox" });
      expect(closed.lineSandboxOpen).toBe(false);
      expect(closed.overlays).toEqual(["arsenal"]);
    });
  });

  describe("catalog ball detail", () => {
    const detail = run([
      { type: "pushOverlay", overlay: "catalog" },
      { type: "openCatalogBall", ballId: "storm-physix-blackout-2025" }
    ]);

    it("takes the detail first, leaving the catalog standing", () => {
      const popped = navReducer(detail, { type: "popOverlay" });
      expect(popped.catalogBallId).toBeNull();
      expect(popped.overlays).toEqual(["catalog"]);
    });

    it("pops the catalog once the detail is closed", () => {
      const popped = navReducer(navReducer(detail, { type: "popOverlay" }), { type: "popOverlay" });
      expect(popped.overlays).toEqual([]);
    });
  });
});

const nav = (over: Partial<NavState> = {}): NavState => ({ ...INITIAL_NAV, ...over });

describe("leaving a pushed screen for a tab", () => {
  it("switches tab and drops the push in one move", () => {
    const state = navReducer(
      nav({ view: "dashboard", overlays: ["game-plan"] }),
      { type: "crossToTab", view: "stats" }
    );
    expect(state.view).toBe("stats");
    expect(state.overlays).toEqual([]);
  });

  it("starts Settings at its menu, like the tab bar does", () => {
    const state = navReducer(
      nav({ view: "dashboard", overlays: ["game-plan"], settingsSection: "lanes" }),
      { type: "crossToTab", view: "settings" }
    );
    expect(state.settingsSection).toBe("menu");
  });

  it("leaves the push behind when a session opens from inside one", () => {
    const state = navReducer(nav({ view: "dashboard", overlays: ["game-plan"] }), {
      type: "openSession",
      sessionId: 7
    });
    expect(state.view).toBe("active");
    expect(state.activeSessionId).toBe(7);
    expect(state.overlays).toEqual([]);
  });

  it("keeps the push for an ordinary tab switch, which cannot happen from one", () => {
    const state = navReducer(nav({ view: "dashboard", overlays: ["arsenal"] }), {
      type: "goTo",
      view: "history"
    });
    expect(state.overlays).toEqual(["arsenal"]);
  });
});
