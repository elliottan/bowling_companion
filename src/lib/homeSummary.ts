import { calculateSessionTrend, type SessionTrendPoint } from "./stats";
import type { SessionSummary } from "../types/bowling";

/** Sessions drawn on Home's trend line: enough to show a direction, few
 *  enough that each one is a visible step. */
export const HOME_TREND_SESSIONS = 12;

export interface HomeSummary {
  /** Every finished game's score, averaged, as Stats reads it with nothing
   *  filtered. Null before the first finished game. */
  average: number | null;
  games: number;
  /** The latest session with a finished game. */
  last: SessionTrendPoint | null;
  /** Session averages, oldest first, ending on `last`. */
  trend: number[];
}

/**
 * What Home's hero card says: the bowler's average, the last session against
 * it, and the line of the latest sessions between them (ADR-245). Read from
 * finished games only, as every average in the app is.
 */
export function summarizeHome(sessions: SessionSummary[]): HomeSummary {
  const points = calculateSessionTrend(sessions);
  const scores = points.flatMap((p) => p.scores);
  return {
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    games: scores.length,
    last: points[points.length - 1] ?? null,
    trend: points.slice(-HOME_TREND_SESSIONS).map((p) => p.average)
  };
}
