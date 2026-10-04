import type { SessionSummary } from "../types/bowling";
import { calculateGameScore } from "./scoring";

/**
 * What Home says about "tonight" (ADR-115): the alleys a bowler goes back to,
 * as one-tap starts, and a one-line read of the last session.
 */

/** A recent alley, with what a session there is usually called and bowled on,
 *  so a tap can start one prefilled. */
export interface RecentAlley {
  alley_name: string;
  description?: string;
  oil_pattern_id?: number;
}

/**
 * The most recent distinct alley-and-description pairs, newest first. Keyed on
 * both, because the same alley on league night and on a practice afternoon are
 * two different starts. Sessions with no alley are skipped: there is nothing to
 * prefill from them.
 */
export function recentAlleys(sessions: SessionSummary[], limit = 3): RecentAlley[] {
  const seen = new Set<string>();
  const out: RecentAlley[] = [];
  for (const { session } of sessions) {
    const alley = session.alley_name?.trim();
    if (!alley) continue;
    const description = session.description?.trim() || undefined;
    const key = `${alley.toLowerCase()}\u0000${description?.toLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      alley_name: alley,
      ...(description && { description }),
      ...(session.oil_pattern_id != null && { oil_pattern_id: session.oil_pattern_id })
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** A session's series and average over its scored games, or null with none. */
export function sessionSeries(
  summary: SessionSummary
): { series: number; average: number; games: number } | null {
  const scores = summary.games
    .map((g) =>
      g.final_score ?? (g.frames.length === 10 ? calculateGameScore(g.frames).total : undefined)
    )
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  const series = scores.reduce((a, b) => a + b, 0);
  return { series, average: Math.round(series / scores.length), games: scores.length };
}
