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
export type StatsRange = "last10" | "months3" | "all";

export const STATS_RANGES: ReadonlyArray<{ value: StatsRange; label: string }> = [
  { value: "last10", label: "Last 10" },
  { value: "months3", label: "3 months" },
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

/** Days in the "3 months" window. */
export const RECENT_DAYS = 90;

/**
 * The first day a window of `days` ending today keeps, as a `YYYY-MM-DD` key.
 *
 * A rolling window rather than a season (ADR-127): a season start is a date the
 * app cannot know, since leagues start when they start, and nothing on screen
 * said which one it had guessed. Ninety days back from today needs no guessing
 * and never empties on the first day of anything.
 */
export function windowStart(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  // UTC noon, so the arithmetic never crosses a daylight-saving boundary.
  return new Date(Date.UTC(y, m - 1, d - days, 12)).toISOString().slice(0, 10);
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
  if (range === "months3") {
    const start = windowStart(today, RECENT_DAYS);
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
