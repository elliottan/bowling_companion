import { INITIAL_NAV, navReducer } from "./appNavigation";
import type { AppView, NavState, Overlay, SettingsSection } from "./appNavigation";

/**
 * The URL as a projection of `NavState`: the navigation state is the source of
 * truth, and the hash is what it looks like written down. That direction
 * matters. The reducer owns the rules; this file only serialises them, so the
 * URL can never describe a screen the reducer would not produce.
 *
 * A hash rather than a path because the app is offline-first: no server rewrite
 * rule to keep in step, and it resolves from the service worker cache.
 *
 * Shape: `#/<view>[/<session-or-section>][/<overlay>...][/line]`, for example
 * `#/settings/lanes`, `#/session/12`, `#/home/arsenal/catalog`.
 *
 * Anything unreadable resolves to the dashboard rather than throwing. A stale
 * bookmark or a hand-edited link should open the app, not break it.
 */

/** What a route can say. The rest of `NavState` (previousView, the one-shot
 *  stats flag) is session memory, not a place, so it stays out of the URL. */
export interface AppRoute {
  view: AppView;
  sessionId?: number;
  settingsSection?: SettingsSection;
  overlays: Overlay[];
  lineSandbox?: boolean;
}

const VIEW_SEGMENT: Record<AppView, string> = {
  dashboard: "home",
  active: "session",
  history: "history",
  spares: "spares",
  settings: "settings"
};

const SEGMENT_VIEW = new Map<string, AppView>(
  Object.entries(VIEW_SEGMENT).map(([view, segment]) => [segment, view as AppView])
);

const OVERLAYS: readonly string[] = ["arsenal", "catalog", "lanes", "oil-patterns", "backup"];

const SETTINGS_SECTIONS: readonly string[] = [
  "menu",
  "arsenal",
  "lanes",
  "oil-patterns",
  "backup",
  "preferences",
  "appearance"
];

const LINE_SEGMENT = "line";

export const HOME_ROUTE: AppRoute = { view: "dashboard", overlays: [] };

export function toRoute(state: NavState): AppRoute {
  const route: AppRoute = { view: state.view, overlays: state.overlays };
  if (state.view === "active" && state.activeSessionId != null) {
    route.sessionId = state.activeSessionId;
  }
  if (state.view === "settings" && state.settingsSection !== "menu") {
    route.settingsSection = state.settingsSection;
  }
  if (state.lineSandboxOpen) route.lineSandbox = true;
  return route;
}

export function formatRoute(route: AppRoute): string {
  const parts = [VIEW_SEGMENT[route.view]];

  if (route.view === "active" && route.sessionId != null) parts.push(String(route.sessionId));
  // "menu" is the settings screen itself, so it stays implicit.
  if (route.view === "settings" && route.settingsSection && route.settingsSection !== "menu") {
    parts.push(route.settingsSection);
  }

  parts.push(...route.overlays);
  if (route.lineSandbox) parts.push(LINE_SEGMENT);

  return `#/${parts.join("/")}`;
}

export function parseRoute(hash: string): AppRoute {
  const segments = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const view = SEGMENT_VIEW.get(segments[0] ?? "");
  if (!view) return HOME_ROUTE;

  const route: AppRoute = { view, overlays: [] };
  let i = 1;

  if (view === "active") {
    const id = Number(segments[i]);
    // A session route without a usable id is just the empty active tab.
    if (Number.isInteger(id) && id > 0) {
      route.sessionId = id;
      i += 1;
    }
  } else if (view === "settings" && SETTINGS_SECTIONS.includes(segments[i] ?? "")) {
    const section = segments[i] as SettingsSection;
    if (section !== "menu") route.settingsSection = section;
    i += 1;
  }

  for (; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment === LINE_SEGMENT) route.lineSandbox = true;
    else if (OVERLAYS.includes(segment)) route.overlays.push(segment as Overlay);
    // Anything else is dropped: an unknown segment must not strand the user on
    // a screen the app cannot render.
  }

  return route;
}

/** The hash for a state, ready to compare against `location.hash`. */
export function routeHash(state: NavState): string {
  return formatRoute(toRoute(state));
}

/**
 * Whether moving between two states should leave a history entry behind.
 *
 * Pushing an overlay, opening a session and entering a Settings section are
 * things the user navigated *into*, so back should undo them one at a time.
 * Switching tabs is not: the tab bar is always on screen, nobody reaches for
 * back to change tabs, and stacking them would mean several backs to leave the
 * app. Same for landing on a different session in the same tab.
 */
export function shouldPushHistory(from: NavState, to: NavState): boolean {
  if (to.overlays.length > from.overlays.length) return true;
  if (to.lineSandboxOpen && !from.lineSandboxOpen) return true;
  if (to.view === "active" && from.view !== "active") return true;
  if (to.view === "settings" && to.settingsSection !== "menu" && from.settingsSection === "menu") {
    return true;
  }
  return false;
}

/**
 * The navigation state a URL describes, for `useReducer`'s lazy initialiser.
 *
 * Restoring at construction rather than in a mount effect is what keeps the
 * URL and the state from disagreeing on the very first commit: an effect would
 * run after the sync effect had already written the initial (wrong) state out
 * to the address bar, and pushed a history entry for it.
 */
export function initialNavFromHash(hash: string): NavState {
  return navReducer(INITIAL_NAV, { type: "restore", route: parseRoute(hash) });
}
