import { isSpare, isStrike } from "./scoring";
import type { Frame, PinNumber, SessionSummary } from "../types/bowling";

export interface AlleyStats {
  alley: string;
  games: number;
  average: number | null;
  high: number | null;
}

export interface BowlingStats {
  totalSessions: number;
  totalGames: number;
  completedGames: number;
  averageScore: number | null;
  highGame: number | null;
  strikePct: number | null;
  sparePct: number | null;
  byAlley: AlleyStats[];
}

/**
 * Aggregate stats across all sessions. Pure — consumes the SessionSummary[]
 * the repository already builds. Averages and the high game use COMPLETED
 * games only (final_score set); strike/spare rates use every ball actually
 * thrown across all games.
 *
 * Strike % = strike frames / first-ball opportunities. The 10th frame can
 * carry up to three fresh-rack balls, each a strike opportunity.
 * Spare % = spares made / spare opportunities, where an opportunity is a
 * non-strike frame in which a second ball was thrown.
 */
export function calculateStats(sessions: SessionSummary[]): BowlingStats {
  const allGames = sessions.flatMap((s) =>
    s.games.map((g) => ({ alley: s.session.alley_name, game: g }))
  );

  const completedScores: number[] = [];
  const alleyMap = new Map<string, number[]>();
  let strikeOpps = 0;
  let strikes = 0;
  let spareOpps = 0;
  let spares = 0;

  for (const { alley, game } of allGames) {
    if (typeof game.final_score === "number") {
      completedScores.push(game.final_score);
      if (!alleyMap.has(alley)) alleyMap.set(alley, []);
      alleyMap.get(alley)!.push(game.final_score);
    }

    for (const frame of game.frames) {
      const tally = tallyFrame(frame);
      strikeOpps += tally.strikeOpps;
      strikes += tally.strikes;
      spareOpps += tally.spareOpps;
      spares += tally.spares;
    }
  }

  const byAlley: AlleyStats[] = [...alleyMap.entries()]
    .map(([alley, scores]) => ({
      alley,
      games: scores.length,
      average: average(scores),
      high: scores.length ? Math.max(...scores) : null
    }))
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  return {
    totalSessions: sessions.length,
    totalGames: allGames.length,
    completedGames: completedScores.length,
    averageScore: average(completedScores),
    highGame: completedScores.length ? Math.max(...completedScores) : null,
    strikePct: rate(strikes, strikeOpps),
    sparePct: rate(spares, spareOpps),
    byAlley
  };
}

interface FrameTally {
  strikeOpps: number;
  strikes: number;
  spareOpps: number;
  spares: number;
}

function tallyFrame(frame: Frame): FrameTally {
  if (frame.frame_number === 10) return tallyTenthFrame(frame);

  // Frames 1-9: one first-ball strike opportunity.
  const strike = isStrike(frame);
  const t: FrameTally = { strikeOpps: 1, strikes: strike ? 1 : 0, spareOpps: 0, spares: 0 };

  if (!strike && frame.shots[1]) {
    t.spareOpps = 1;
    if (isSpare(frame)) t.spares = 1;
  }
  return t;
}

function tallyTenthFrame(frame: Frame): FrameTally {
  const t: FrameTally = { strikeOpps: 0, strikes: 0, spareOpps: 0, spares: 0 };
  const shot1Standing = frame.shots[0].pins_standing;
  const shot1Strike = clears(shot1Standing);

  // Ball 1 is always a strike opportunity once thrown.
  t.strikeOpps += 1;
  if (shot1Strike) t.strikes += 1;

  if (!frame.shots[1]) return t;

  const shot2Standing = frame.shots[1].pins_standing;

  if (shot1Strike) {
    // Fresh rack on ball 2 -> another strike opportunity.
    t.strikeOpps += 1;
    if (clears(shot2Standing)) t.strikes += 1;
  } else {
    // Ball 2 completes a spare opportunity.
    t.spareOpps += 1;
    if (clears2(shot1Standing, shot2Standing)) t.spares += 1;
  }

  if (!frame.shots[2]) return t;

  const shot3Standing = frame.shots[2].pins_standing;

  // Ball 3 exists only after a strike or spare; it lands on a fresh rack iff
  // ball 2 cleared the lane. Treat a fresh-rack ball 3 as a strike opportunity.
  const ball2FreshRack = shot1Strike;
  const ball2Cleared = ball2FreshRack
    ? clears(shot2Standing)
    : clears2(shot1Standing, shot2Standing);

  if (ball2Cleared) {
    t.strikeOpps += 1;
    if (clears(shot3Standing)) t.strikes += 1;
  }
  return t;
}

/** A ball that leaves no pins standing knocked them all down. */
function clears(standing?: PinNumber[]): boolean {
  return Array.isArray(standing) && standing.length === 0;
}

/** Second ball cleared whatever the first ball left. */
function clears2(prevStanding: PinNumber[], currStanding?: PinNumber[]): boolean {
  return Array.isArray(currStanding) && currStanding.length === 0 && prevStanding.length > 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function rate(made: number, opportunities: number): number | null {
  if (opportunities === 0) return null;
  return Math.round((made / opportunities) * 100);
}

// ---------------------------------------------------------------------------
// Leave stats
// ---------------------------------------------------------------------------

export interface LeaveStats {
  pins: PinNumber[];
  attempts: number;
  conversions: number;
  conversionPct: number | null;
}

export function calculateCommonLeaves(sessions: SessionSummary[]): LeaveStats[] {
  const leaveMap = new Map<string, LeaveStats>();

  const allFrames = sessions.flatMap((s) =>
    s.games.flatMap((g) => g.frames)
  );

  for (const frame of allFrames) {
    if (frame.is_strike) continue;
    if (!frame.shots[0] || frame.shots[0].pins_standing.length === 0) continue;

    const leave = [...frame.shots[0].pins_standing].sort((a, b) => a - b) as PinNumber[];
    const key = leave.join("-");

    const converted = Boolean(frame.shots[1] && frame.shots[1].pins_standing.length === 0);

    if (!leaveMap.has(key)) {
      leaveMap.set(key, { pins: leave, attempts: 0, conversions: 0, conversionPct: null });
    }
    const entry = leaveMap.get(key)!;
    entry.attempts++;
    if (converted) entry.conversions++;
  }

  return [...leaveMap.values()]
    .map((entry) => ({
      ...entry,
      conversionPct: entry.attempts > 0 ? Math.round((entry.conversions / entry.attempts) * 100) : null
    }))
    .sort((a, b) => b.attempts - a.attempts || a.pins.join("-").localeCompare(b.pins.join("-")));
}

// ---------------------------------------------------------------------------
// Session filtering
// ---------------------------------------------------------------------------

export interface FilterOptions {
  oilPattern?: string;
  alleyName?: string;
  laneNumber?: string;
}

export function filterSessionsBy(
  sessions: SessionSummary[],
  filter: FilterOptions
): SessionSummary[] {
  return sessions.reduce<SessionSummary[]>((acc, s) => {
    if (filter.oilPattern) {
      const pat = filter.oilPattern.toLowerCase();
      const op = s.session.oil_pattern?.toLowerCase() ?? "";
      if (!op.includes(pat)) return acc;
    }

    if (filter.alleyName) {
      if (s.session.alley_name.toLowerCase() !== filter.alleyName.toLowerCase()) return acc;
    }

    if (filter.laneNumber) {
      const filteredGames = s.games.filter(
        (g) => g.lane_number?.toLowerCase() === filter.laneNumber!.toLowerCase()
      );
      if (filteredGames.length === 0) return acc;
      acc.push({ session: s.session, games: filteredGames });
      return acc;
    }

    acc.push(s);
    return acc;
  }, []);
}
