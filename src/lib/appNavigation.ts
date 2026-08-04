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

export type AppView = "dashboard" | "active" | "history" | "spares" | "settings";

/** Screens that float above the tab bar, newest last. Pushing one keeps what is
 *  underneath alive, so back pops one level instead of collapsing the stack. */
export type Overlay = "arsenal" | "catalog";

export interface NavState {
  view: AppView;
  /** The tab to return to when leaving the active session (set on entry). */
  previousView: AppView;
  activeSessionId: number | null;
  /** Land on the session with its stats sheet already up (a finished session). */
  openSessionStats: boolean;
  settingsSection: SettingsSection;
  overlays: Overlay[];
  lineSandboxOpen: boolean;
}

export type NavAction =
  | { type: "goTo"; view: AppView }
  | { type: "openSession"; sessionId: number; openStats?: boolean }
  | { type: "leaveSession" }
  | { type: "goToSettingsSection"; section: SettingsSection }
  | { type: "pushOverlay"; overlay: Overlay }
  | { type: "popOverlay" }
  | { type: "openLineSandbox" }
  | { type: "closeLineSandbox" }
  | { type: "statsOpened" }
  | { type: "sessionDeleted"; sessionId: number }
  | { type: "resumeAvailable"; sessionId: number };

export const INITIAL_NAV: NavState = {
  view: "dashboard",
  previousView: "dashboard",
  activeSessionId: null,
  openSessionStats: false,
  settingsSection: "menu",
  overlays: [],
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
        openSessionStats: action.openStats ?? false
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
      return { ...state, overlays: state.overlays.slice(0, -1) };

    case "openLineSandbox":
      return { ...state, lineSandboxOpen: true };

    case "closeLineSandbox":
      return { ...state, lineSandboxOpen: false };

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

    case "resumeAvailable":
      // On launch only: an unfinished game today opens straight into scoring.
      return { ...state, view: "active", activeSessionId: action.sessionId };
  }
}

/** The label a pushed screen shows for the screen underneath it. */
export function underLabel(
  state: NavState,
  index: number,
  tabLabel: Record<AppView, string>,
  overlayLabel: Record<Overlay, string>
): string {
  return index === 0 ? tabLabel[state.view] : overlayLabel[state.overlays[index - 1]];
}
