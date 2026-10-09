import type { Handedness, SessionSummary } from "../types/bowling";
import { lanesOf } from "./filterFacets";
import { calculateStats } from "./stats";

/**
 * How far back the Stats tab reads (ADR-126).
 *
 * A time window, not a facet: it narrows by when, where the filters narrow by
 * where and what. It sits on the Stats tab itself and History does not read
 * it, because a list of sessions is already in date order and needs no window.
 */
export type StatsRange = "last10" | "season" | "all";

export const STATS_RANGES: ReadonlyArray<{ value: StatsRange; label: string }> = [
  { value: "last10", label: "Last 10" },
  { value: "season", label: "Season" },
  { value: "all", label: "All" }
];

/** Sessions in the "Last 10" window. */
export const LAST_SESSIONS = 10;

/** Sessions the recent form is read over. */
export const RECENT_SESSIONS = 5;

/** Scored sessions in scope before recent form is shown at all. With fewer,
 *  the last five are most of the average they are compared against, and the
 *  difference says nothing. */
export const FORM_MIN_SESSIONS = 10;

/** League seasons run from late summer, so a season starts on 1 August. Before
 *  that date in a year, the season under way is the one that began last year. */
export function seasonStart(today: string): string {
  const year = Number(today.slice(0, 4));
  return today.slice(5) >= "08-01" ? `${year}-08-01` : `${year - 1}-08-01`;
}

/** A session with a finished game on the lanes being read: the same test the
 *  trend line uses to decide a night is a point. */
function isScored(s: SessionSummary, lanes: string[]): boolean {
  return s.games.some(
    (g) =>
      g.final_score !== undefined &&
      (lanes.length === 0 || lanesOf(g).some((l) => lanes.includes(l)))
  );
}

function byDate(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => a.session.date.localeCompare(b.session.date));
}

/**
 * The sessions a range keeps, oldest first.
 *
 * "Last 10" counts scored sessions only, so a night started and never finished
 * does not take a slot from one that was bowled.
 */
export function sessionsInRange(
  sessions: SessionSummary[],
  range: StatsRange,
  today: string,
  lanes: string[] = []
): SessionSummary[] {
  if (range === "all") return sessions;
  if (range === "season") {
    const start = seasonStart(today);
    return sessions.filter((s) => s.session.date >= start);
  }
  return byDate(sessions.filter((s) => isScored(s, lanes))).slice(-LAST_SESSIONS);
}

export interface RecentForm {
  /** The game average over the last `RECENT_SESSIONS` scored sessions. */
  average: number;
  /** That, less the average over everything in scope, in whole pins. */
  difference: number;
}

/**
 * The last five sessions against the whole scope, for the headline.
 *
 * Both sides are game averages from `calculateStats`, the same call as the
 * number it sits under, so the two cannot disagree about what an average is.
 * Null until there are `FORM_MIN_SESSIONS` scored sessions to compare against.
 */
export function calculateRecentForm(
  sessions: SessionSummary[],
  overallAverage: number | null,
  lanes: string[] = [],
  handedness: Handedness = "right"
): RecentForm | null {
  if (overallAverage === null) return null;
  const scored = byDate(sessions.filter((s) => isScored(s, lanes)));
  if (scored.length < FORM_MIN_SESSIONS) return null;
  const recent = calculateStats(scored.slice(-RECENT_SESSIONS), lanes, handedness).averageScore;
  if (recent === null) return null;
  return { average: recent, difference: recent - overallAverage };
}
