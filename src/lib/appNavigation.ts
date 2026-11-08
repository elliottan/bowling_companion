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
  | "lanes"
  | "oil-patterns"
  | "appearance"
  | "profile"
  | "tools"
  | "legal"
  | "live-activity";

import type { LayoutSeed } from "./layoutShare";

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
  /** The guide list: layout and equipment articles that ship with the app.
   *  A sibling of the catalog and the spare lines, reference you keep rather
   *  than a place you sit, so it is pushed from the dashboard like they are. */
  | "guides"
  /** The dual angle layout lab: sliders, a ball you can turn, and what the
   *  layout will do. A sandbox like the line visualizer rather than a record,
   *  so it saves nothing and is pushed from the dashboard beside its siblings. */
  | "layout-lab"
  | "open-frames"
  | "game-trend"
  | "game-plan"
  /** What Headpin Pro is, with samples, before anything charges (ADR-164).
   *  Every locked card, the Home banner and Settings open it. */
  | "pro"
  /** The line sandbox: the lane view on a line of its own, reached from Home,
   *  a pattern or a guide. A pushed screen like the rest (ADR-211), so back
   *  and the Pro page over it work as they do over any other. */
  | "line"
  /** A session you are looking at rather than bowling. Pushed over whatever
   *  list you opened it from, so back returns to the list and the Active tab
   *  keeps the session you are actually bowling (ADR-084). */
  | "session"
  /** The Stats tab's own screen, pushed rather than switched to. The game plan
   *  hands off to it with the filters already set, and a hand-off that switched
   *  tabs left no way back to the screen that made the point (ADR-083). */
  | "stats-push"
  /** History's list, pushed rather than switched to, for the same reason as
   *  `stats-push`: a pattern's sheet and the search hand off to it with the
   *  filter already set, and back returns to where the question was asked
   *  (ADR-247). */
  | "history-push"
  /** The search over everything (ADR-247). A layer over the screen it was
   *  opened from, blurred behind it, and whatever a result opens is pushed on
   *  top, so back comes home to the results as they were typed. */
  | "search";

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
  /** The catalog balls under the open one, oldest first. A ball opened from
   *  another's Same core or Same cover row is pushed over it rather than in
   *  its place, so back and the drag-back gesture return to that ball, with
   *  it already drawn underneath, not to the list (ADR-257). Empty whenever no
   *  ball is open. */
  catalogBallTrail: string[];
  /** The guide whose article is open, by id. A layer on top of the guides
   *  overlay for the same reason as `catalogBallId`: it exists only while the
   *  guides list is the top overlay, and the Overlay union cannot carry an
   *  id. */
  openGuideId: string | null;
  /** The term the open guide scrolls to, when a search result named one
   *  (ADR-249). Content beside the guide rather than part of its route. */
  openGuideTerm: string | null;
  /** The line whose shots are open in the Alley report, by `lineReport` id. A
   *  layer on top of the game-plan overlay for the same reason as
   *  `catalogBallId`. */
  reportLineId: string | null;
  /** The layout the pushed lab opens on, when it was sent there by a ball in
   *  the arsenal rather than reached on its own. A field beside the overlay for
   *  the same reason as `catalogBallId`: the Overlay union cannot carry one.
   *  Deliberately not part of the route: it is content, and the query string is
   *  where a layout goes in a URL (see `layoutShare.ts`). */
  layoutSeed: LayoutSeed | null;
  /** The session the pushed `session` overlay is showing, by id. A field beside
   *  the overlay rather than part of it, for the same reason as
   *  `catalogBallId`: the Overlay union cannot carry an id. Distinct from
   *  `activeSessionId`, which is the session being bowled (ADR-084). */
  viewedSessionId: number | null;
  /** The pattern the sandbox opens with drawn on the lane, when it was sent
   *  there from a pattern's own detail sheet rather than reached on its own.
   *  A field beside the `line` overlay for the same reason as `catalogBallId`:
   *  it is content, not part of the route (see `layoutSeed`). */
  lineSandboxPatternId: number | null;
  /** The pattern whose sheet the pushed `oil-patterns` list opens on, when a
   *  search result sent it there. Content beside the overlay, like
   *  `lineSandboxPatternId`, so not part of the route. */
  openPatternId: number | null;
  /** The ball whose sheet the pushed arsenal opens on, from a search result. */
  openArsenalBallId: number | null;
  /** What the pushed catalog opens already searched for, from a search. */
  catalogSearch: string | null;
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
  /** Look at a session without making it the one you are bowling. */
  | { type: "viewSession"; sessionId: number; openStats?: boolean; gameId?: number; ballId?: number }
  | { type: "goToSettingsSection"; section: SettingsSection }
  | { type: "pushOverlay"; overlay: Overlay }
  | { type: "popOverlay" }
  /** `push` opens the catalog first when it is not the screen on top, which
   *  is how a search result reaches a ball. */
  | { type: "openCatalogBall"; ballId: string; push?: boolean }
  /** Every catalog ball closed at once, back to the list under them. */
  | { type: "closeCatalogBalls" }
  | { type: "openGuide"; guideId: string; push?: boolean; term?: string }
  /** The pattern list, pushed, with one pattern's sheet already open. */
  | { type: "openPattern"; patternId: number }
  /** The arsenal, pushed, with one ball's sheet already open. */
  | { type: "openArsenalBall"; ballId: number }
  /** The catalog, pushed, already searched for `query`. */
  | { type: "openCatalogSearch"; query: string }
  | { type: "openReportLine"; lineId: string }
  /** Open the layout lab, optionally on a layout something else chose. */
  | { type: "openLayoutLab"; seed?: LayoutSeed }
  | { type: "openLineSandbox"; patternId?: number }
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
  /** The pushed session, which is not the same thing as `sessionId`: that one
   *  is the Active tab's. */
  viewedSessionId?: number;
  settingsSection?: SettingsSection;
  overlays: Overlay[];
  catalogBallId?: string;
  guideId?: string;
  reportLineId?: string;
}

/** Overlays that open above every sheet rather than under it: the Pro page,
 *  which a lock inside a sheet opens, and which closes back to that sheet
 *  (ADR-175), and the line sandbox, which a pattern's own sheet opens
 *  (ADR-211). */
export const ABOVE_SHEETS: readonly Overlay[] = ["pro", "line"];

/** Whether the screen in front sits above whatever sheets are open. */
export function coversSheets(state: Pick<NavState, "overlays">): boolean {
  const top = state.overlays[state.overlays.length - 1];
  return top !== undefined && ABOVE_SHEETS.includes(top);
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
  catalogBallTrail: [],
  openGuideId: null,
  openGuideTerm: null,
  reportLineId: null,
  layoutSeed: null,
  viewedSessionId: null,
  lineSandboxPatternId: null,
  openPatternId: null,
  openArsenalBallId: null,
  catalogSearch: null
};

export function navReducer(state: NavState, action: NavAction): NavState {
  const next = reduce(state, action);
  // A trail is only ever under an open ball: whatever closed the ball closed
  // the balls beneath it too.
  return next.catalogBallId === null && next.catalogBallTrail.length > 0 ? { ...next, catalogBallTrail: [] } : next;
}

/** Where a restored route leaves the trail: a back to a ball beneath drops
 *  the balls above it, a forward to a new ball stacks the one it left. */
function trailAfterRestore(state: NavState, ballId: string | null): string[] {
  if (ballId === null) return [];
  if (ballId === state.catalogBallId) return state.catalogBallTrail;
  const below = state.catalogBallTrail.lastIndexOf(ballId);
  if (below >= 0) return state.catalogBallTrail.slice(0, below);
  return state.catalogBallId !== null ? [...state.catalogBallTrail, state.catalogBallId] : [];
}

function reduce(state: NavState, action: NavAction): NavState {
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
        // A session is a place, and no pushed screen belongs in front of it.
        // Reached from one (the game plan's "last time"), the push comes off.
        overlays: [],
        layoutSeed: null,
        activeSessionId: action.sessionId,
        openSessionStats: action.openStats ?? false,
        openSessionGameId: action.gameId ?? null,
        openSessionBallId: action.ballId ?? null
      };

    /**
     * A session you are reading, pushed over the list you opened it from.
     *
     * Nothing about the Active tab moves: the session you are bowling stays
     * loaded in it, and the dashboard goes on treating you as between sessions,
     * which is what it means to be reading one (ADR-084). The one-shot fields
     * are shared with `openSession`, since only one session screen is ever on
     * top and they are cleared the moment it reads them.
     */
    case "viewSession":
      return {
        ...state,
        overlays:
          state.overlays[state.overlays.length - 1] === "session"
            ? state.overlays
            : [...state.overlays, "session"],
        viewedSessionId: action.sessionId,
        openSessionStats: action.openStats ?? false,
        openSessionGameId: action.gameId ?? null,
        openSessionBallId: action.ballId ?? null
      };

    case "leaveSession":
      return { ...state, view: state.previousView };

    /**
     * Land on a Settings section, with nothing left standing over it.
     *
     * The overlays go because a settings section is a destination on a tab, and
     * a pushed screen left up in front of it hides the thing just navigated to.
     * The layout lab's own "Settings" item is where this bit: it used to pop
     * the overlay and then dispatch this, two steps, and the pop goes through
     * `history.back()`, which lands asynchronously. The dispatch ran first, the
     * pop arrived a moment later carrying the route from before it, and the
     * reducer dutifully restored the lab over the Settings screen. The tap
     * looked like it did nothing at all. One action that describes the whole
     * move cannot race itself.
     */
    case "goToSettingsSection":
      return {
        ...state,
        view: "settings",
        settingsSection: action.section,
        overlays: [],
        viewedSessionId: null,
        catalogBallId: null,
        openGuideId: null,
        openGuideTerm: null,
        reportLineId: null,
        layoutSeed: null,
        openPatternId: null,
        openArsenalBallId: null,
        catalogSearch: null
      };

    case "pushOverlay":
      // Re-pushing the overlay already on top is a no-op: the shortcut that
      // opens it is reachable from the screen itself.
      return state.overlays[state.overlays.length - 1] === action.overlay
        ? state
        : {
            ...state,
            overlays: [...state.overlays, action.overlay],
            // Reaching the lab on its own is asking about no ball in
            // particular, so a seed left over from the last one goes. The
            // same for a pattern, a ball or a catalog search a result left.
            layoutSeed: action.overlay === "layout-lab" ? null : state.layoutSeed,
            openPatternId: action.overlay === "oil-patterns" ? null : state.openPatternId,
            openArsenalBallId: action.overlay === "arsenal" ? null : state.openArsenalBallId,
            catalogSearch: action.overlay === "catalog" ? null : state.catalogSearch
          };

    case "popOverlay": {
      // A ball detail is on top of the catalog, so back takes it first and
      // leaves the catalog standing. An open guide is the same layer over the
      // guides list.
      if (state.catalogBallId !== null) {
        const trail = state.catalogBallTrail;
        return trail.length > 0
          ? { ...state, catalogBallId: trail[trail.length - 1], catalogBallTrail: trail.slice(0, -1) }
          : { ...state, catalogBallId: null };
      }
      if (state.openGuideId !== null) return { ...state, openGuideId: null, openGuideTerm: null };
      // Only while the report is the screen on top: a game opened from a shot
      // sits over the line, and back has to take the game off first.
      if (
        state.reportLineId !== null &&
        state.overlays[state.overlays.length - 1] === "game-plan"
      ) {
        return { ...state, reportLineId: null };
      }
      const overlays = state.overlays.slice(0, -1);
      // The id goes with the screen that was showing it, or a later push of
      // another session would flash the last one on its way in.
      // Each id goes with the screen that was showing it, or a later push would
      // flash the last one on its way in.
      const next = overlays.includes("layout-lab") ? state.layoutSeed : null;
      const pattern = overlays.includes("line") ? state.lineSandboxPatternId : null;
      const seeds = {
        openPatternId: overlays.includes("oil-patterns") ? state.openPatternId : null,
        openArsenalBallId: overlays.includes("arsenal") ? state.openArsenalBallId : null,
        catalogSearch: overlays.includes("catalog") ? state.catalogSearch : null
      };
      return overlays.includes("session")
        ? { ...state, ...seeds, overlays, layoutSeed: next, lineSandboxPatternId: pattern }
        : { ...state, ...seeds, overlays, layoutSeed: next, lineSandboxPatternId: pattern, viewedSessionId: null };
    }

    case "openCatalogBall":
      return action.push && state.overlays[state.overlays.length - 1] !== "catalog"
        ? { ...state, overlays: [...state.overlays, "catalog"], catalogSearch: null, catalogBallId: action.ballId, catalogBallTrail: [] }
        : {
            ...state,
            catalogBallId: action.ballId,
            // Opened from another ball's page, it goes over that ball.
            catalogBallTrail:
              state.catalogBallId !== null && state.catalogBallId !== action.ballId
                ? [...state.catalogBallTrail, state.catalogBallId]
                : state.catalogBallTrail
          };

    case "closeCatalogBalls":
      return { ...state, catalogBallId: null, catalogBallTrail: [] };

    case "openGuide": {
      const term = action.term ?? null;
      return action.push && state.overlays[state.overlays.length - 1] !== "guides"
        ? { ...state, overlays: [...state.overlays, "guides"], openGuideId: action.guideId, openGuideTerm: term }
        : { ...state, openGuideId: action.guideId, openGuideTerm: term };
    }

    /**
     * A screen and the thing on it in one move, as a search result asks for.
     * One action rather than a push and then a write, for the reason
     * `openLayoutLab` gives: the screen and what it opens on arrive together.
     */
    case "openPattern":
      return { ...state, overlays: [...state.overlays, "oil-patterns"], openPatternId: action.patternId };

    case "openArsenalBall":
      return { ...state, overlays: [...state.overlays, "arsenal"], openArsenalBallId: action.ballId };

    case "openCatalogSearch":
      return { ...state, overlays: [...state.overlays, "catalog"], catalogSearch: action.query, catalogBallId: null };

    case "openReportLine":
      return { ...state, reportLineId: action.lineId };

    /**
     * The lab, on the layout the caller has in mind.
     *
     * One action rather than a push followed by a write, because the seed and
     * the screen it seeds arrive together or the lab renders once on the
     * defaults and then jumps. Re-opening it while it is already on top swaps
     * the seed, which is what tapping a second ball from underneath means.
     */
    case "openLayoutLab": {
      const seed = action.seed ?? null;
      return state.overlays[state.overlays.length - 1] === "layout-lab"
        ? { ...state, layoutSeed: seed }
        : { ...state, overlays: [...state.overlays, "layout-lab"], layoutSeed: seed };
    }

    case "openLineSandbox":
      return {
        ...state,
        overlays:
          state.overlays[state.overlays.length - 1] === "line" ? state.overlays : [...state.overlays, "line"],
        lineSandboxPatternId: action.patternId ?? null
      };

    case "closeLineSandbox": {
      const at = state.overlays.lastIndexOf("line");
      return at < 0
        ? state
        : { ...state, overlays: state.overlays.filter((_, i) => i !== at), lineSandboxPatternId: null };
    }

    case "sessionGameOpened":
      return state.openSessionGameId === null && state.openSessionBallId === null
        ? state
        : { ...state, openSessionGameId: null, openSessionBallId: null };

    case "statsOpened":
      // One-shot: without clearing it the sheet re-opens on every remount, and
      // tab switches remount the session view.
      return state.openSessionStats ? { ...state, openSessionStats: false } : state;

    case "sessionDeleted": {
      // Deleting the session that is open drops us out of it; deleting any
      // other one leaves navigation alone. Both places a session can be open
      // count: the Active tab, and a pushed one on top of a list.
      let next = state;
      if (action.sessionId === state.viewedSessionId) {
        next = {
          ...next,
          viewedSessionId: null,
          overlays: next.overlays.filter((o) => o !== "session")
        };
      }
      if (action.sessionId === state.activeSessionId) {
        next = {
          ...next,
          activeSessionId: null,
          view: next.view === "active" ? next.previousView : next.view
        };
      }
      return next;
    }

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
        catalogBallTrail: trailAfterRestore(state, route.catalogBallId ?? null),
        openGuideId: route.guideId ?? null,
        // A back that leaves the same article open keeps its place; anything
        // else is a fresh visit.
        openGuideTerm: route.guideId && route.guideId === state.openGuideId ? state.openGuideTerm : null,
        // The line view is off the screen for now (ADR-163), so an old link to
        // one opens the report and leaves no id behind: a back press that
        // closes nothing would be the only thing it did.
        reportLineId: null,
        // A restored route is a URL, and a URL says which screen, never which
        // ball: a lab restored from history opens on its own defaults or on the
        // query string, exactly as a pasted link does.
        layoutSeed: null,
        viewedSessionId: route.viewedSessionId ?? null,
        // The pattern is content rather than route, but a back that leaves the
        // sandbox in place (closing the Pro page over it) keeps its pattern.
        lineSandboxPatternId: route.overlays.includes("line") ? state.lineSandboxPatternId : null,
        // The same for what a search result opened a list on: kept by a back
        // that leaves the list standing, gone with it otherwise.
        openPatternId: route.overlays.includes("oil-patterns") ? state.openPatternId : null,
        openArsenalBallId: route.overlays.includes("arsenal") ? state.openArsenalBallId : null,
        catalogSearch: route.overlays.includes("catalog") ? state.catalogSearch : null
      };
    }

    case "resumeAvailable":
      // On launch only: an unfinished game today opens straight into scoring.
      return { ...state, view: "active", activeSessionId: action.sessionId };
  }
}

