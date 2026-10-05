/** The three tabs of the session panel (`components/SessionLanePanel`). */
export type SessionPanelTab = "sheet" | "stats" | "lanes";

/** The one game the panel is about, and a token that re-fires the sheet's
 *  scroll when the same game is asked for twice. No game is the whole series. */
export interface PanelSelection {
  gameId?: number;
  token: number;
}

/**
 * What a tap on a game chip does while the panel is up. The chips are the
 * screen's own, above the panel, so the screen asks this rather than knowing
 * the rule.
 *
 * On the stats tab a chip is a filter: it scopes the numbers to that game and
 * stays put, and tapping the one already on gives the series back. Anywhere
 * else it is a way to a place: it goes to the sheet and scrolls to the game.
 * The token is bumped either way, so a re-tap still re-scrolls.
 */
export function tapGameChip(
  tab: SessionPanelTab,
  selection: PanelSelection,
  gameId: number
): { tab: SessionPanelTab; selection: PanelSelection } {
  const token = selection.token + 1;
  if (tab === "stats") {
    return { tab, selection: { gameId: selection.gameId === gameId ? undefined : gameId, token } };
  }
  return { tab: "sheet", selection: { gameId, token } };
}

/** Whether a game chip reads as on: only on the stats tab, where it changes
 *  what is on screen. Scrolling is a place, not a state, so the sheet leaves
 *  its chips plain. */
export function gameChipOn(tab: SessionPanelTab, selection: PanelSelection, gameId?: number): boolean {
  return tab === "stats" && gameId !== undefined && gameId === selection.gameId;
}
