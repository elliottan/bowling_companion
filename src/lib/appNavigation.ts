/**
 * Where the app is: which tab, which session, which Settings section, and what
 * is stacked on top. This lived as six `useState`s in `App.tsx`, where the
 * rules between them (what "back" means two overlays deep, which tab leaving a
 * session returns to, what happens when the open session is deleted from
 * another screen) were spread across a dozen inline handlers and could only be
 * exercised by driving the whole app.
 *
 * It is a plain reducer so those rules can be read in one place and tested
 * directly. It holds no data and touches no storage: everything here is
 * navigation.
 */

/** The Settings screen's sections. Declared here rather than in the view
 *  because navigating to one is a navigation action, and `lib/` cannot import
 *  from `views/` (see docs/ARCHITECTURE.md). SettingsView re-exports it. */
export type SettingsSection =
  | "menu"
  | "arsenal"
  | "lanes"
  | "oil-patterns"
  | "backup"
  | "preferences"
  | "appearance";

export type AppView = "dashboard" | "active" | "history" | "stats" | "settings";

/** Screens that float above the tab bar, newest last. Pushing one keeps what is
 *  underneath alive, so back pops one level instead of collapsing the stack.
 *
 *  Lane notes, oil patterns and backup are also Settings sections. Reached from
 *  the dashboard they push over the tab the user is on: switching them to the
 *  Settings tab instead put them on a screen they never chose, and back then
 *  showed Settings on its way home.
 *
 *  Spare lines used to be a tab. It lost its slot to Stats (ADR-057) and is
 *  pushed from the dashboard now, which is also where its siblings live: the
 *  arsenal, the catalog and the lane notes are all reference you keep, not
 *  places you sit. */
export type Overlay =
  | "arsenal"
  | "catalog"
  | "lanes"
  | "oil-patterns"
  | "backup"
  | "spares"
  | "open-frames"
  | "game-trend";

export interface NavState {
  view: AppView;
  /** The tab to return to when leaving the active session (set on entry). */
  previousView: AppView;
  activeSessionId: number | null;
  /** Land on the session with its stats sheet already up (a finished session). */
  openSessionStats: boolean;
  /** Land on a specific game of that session, rather than its latest. One-shot,
   *  like openSessionStats, and for the same reason: a tab switch remounts the
   *  session view, which would otherwise yank the game back. */
  openSessionGameId: number | null;
  /** The ball that drill-down was about, so the session sheet can light up the
   *  shots it threw. Cleared with `openSessionGameId`, in the same one shot. */
  openSessionBallId: number | null;
  settingsSection: SettingsSection;
  overlays: Overlay[];
  /** The catalog ball whose detail screen is open, by catalog id. A layer on
   *  top of the catalog overlay rather than an overlay of its own: it only
   *  exists while the catalog is the top overlay, and it carries an id the
   *  Overlay union cannot. It lives here, not in CatalogView, so the platform
   *  back gesture pops it like any other push (see useHistoryRoute). */
  catalogBallId: string | null;
  lineSandboxOpen: boolean;
}

export type NavAction =
  | { type: "goTo"; view: AppView }
  | {
      type: "openSession";
      sessionId: number;
      openStats?: boolean;
      gameId?: number;
      ballId?: number;
    }
  | { type: "leaveSession" }
  | { type: "goToSettingsSection"; section: SettingsSection }
  | { type: "pushOverlay"; overlay: Overlay }
  | { type: "popOverlay" }
  | { type: "openCatalogBall"; ballId: string }
  | { type: "openLineSandbox" }
  | { type: "closeLineSandbox" }
  | { type: "statsOpened" }
  | { type: "sessionGameOpened" }
  | { type: "sessionDeleted"; sessionId: number }
  | { type: "resumeAvailable"; sessionId: number }
  | { type: "restore"; route: RestorableRoute };

/** The part of a route the URL can describe. Declared here (rather than
 *  imported from `appRoute`) so the reducer stays the thing routes are built
 *  against, not the other way round. */
export interface RestorableRoute {
  view: AppView;
  sessionId?: number;
  settingsSection?: SettingsSection;
  overlays: Overlay[];
  catalogBallId?: string;
  lineSandbox?: boolean;
}

export const INITIAL_NAV: NavState = {
  view: "dashboard",
  previousView: "dashboard",
  activeSessionId: null,
  openSessionStats: false,
  openSessionGameId: null,
  openSessionBallId: null,
  settingsSection: "menu",
  overlays: [],
  catalogBallId: null,
  lineSandboxOpen: false
};

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "goTo": {
      const { view } = action;
      return {
        ...state,
        view,
        // Remember the tab we came from, so leaving the session returns there
        // rather than always to the dashboard.
        previousView: view === "active" && state.view !== "active" ? state.view : state.previousView,
        // Entering Settings from the tab bar starts at its menu; the shortcuts
        // that jump to a section use goToSettingsSection instead.
        settingsSection: view === "settings" ? "menu" : state.settingsSection
      };
    }

    case "openSession":
      return {
        ...state,
        view: "active",
        previousView: state.view !== "active" ? state.view : state.previousView,
        activeSessionId: action.sessionId,
        openSessionStats: action.openStats ?? false,
        openSessionGameId: action.gameId ?? null,
        openSessionBallId: action.ballId ?? null
      };

    case "leaveSession":
      return { ...state, view: state.previousView };

    case "goToSettingsSection":
      return { ...state, view: "settings", settingsSection: action.section };

    case "pushOverlay":
      // Re-pushing the overlay already on top is a no-op: the shortcut that
      // opens it is reachable from the screen itself.
      return state.overlays[state.overlays.length - 1] === action.overlay
        ? state
        : { ...state, overlays: [...state.overlays, action.overlay] };

    case "popOverlay":
      // A ball detail is on top of the catalog, so back takes it first and
      // leaves the catalog standing.
      return state.catalogBallId !== null
        ? { ...state, catalogBallId: null }
        : { ...state, overlays: state.overlays.slice(0, -1) };

    case "openCatalogBall":
      return { ...state, catalogBallId: action.ballId };

    case "openLineSandbox":
      return { ...state, lineSandboxOpen: true };

    case "closeLineSandbox":
      return { ...state, lineSandboxOpen: false };

    case "sessionGameOpened":
      return state.openSessionGameId === null && state.openSessionBallId === null
        ? state
        : { ...state, openSessionGameId: null, openSessionBallId: null };

    case "statsOpened":
      // One-shot: without clearing it the sheet re-opens on every remount, and
      // tab switches remount the session view.
      return state.openSessionStats ? { ...state, openSessionStats: false } : state;

    case "sessionDeleted":
      // Deleting the session that is open drops us out of it; deleting any
      // other one leaves navigation alone.
      return action.sessionId === state.activeSessionId
        ? { ...state, activeSessionId: null, view: state.view === "active" ? state.previousView : state.view }
        : state;

    case "restore": {
      const { route } = action;
      return {
        ...state,
        view: route.view,
        // Where back lands after a restore: the tab under the session, since
        // the history entry that got us here is gone by the time this runs.
        previousView: route.view === "active" ? state.previousView : route.view,
        activeSessionId: route.sessionId ?? (route.view === "active" ? state.activeSessionId : null),
        settingsSection: route.settingsSection ?? "menu",
        overlays: route.overlays,
        catalogBallId: route.catalogBallId ?? null,
        lineSandboxOpen: route.lineSandbox ?? false
      };
    }

    case "resumeAvailable":
      // On launch only: an unfinished game today opens straight into scoring.
      return { ...state, view: "active", activeSessionId: action.sessionId };
  }
}

