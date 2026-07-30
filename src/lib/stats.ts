import { isSpare, isStrike } from "./scoring";
import { isBabySplit, isSplit } from "./pins";
import { laneForFrame } from "./lanes";
import type { Ball, Frame, Game, PinNumber, SessionSummary } from "../types/bowling";

type GameWithFrames = Game & { frames: Frame[] };

/** Lanes a game was bowled on (for game-level Avg/High inclusion). */
function gameLanes(game: Game): string[] {
  return game.lanes ?? (game.lane_number ? [game.lane_number] : []);
}

/** Empty/undefined filter = all lanes. Game counts if it touches a selected lane. */
function gameTouchesLanes(game: Game, filter?: Set<string>): boolean {
  if (!filter || filter.size === 0) return true;
  return gameLanes(game).some((l) => filter.has(l));
}

/** Whether a specific frame was bowled on one of the selected lanes. */
function frameOnSelectedLane(game: Game, frameNumber: number, filter?: Set<string>): boolean {
  if (!filter || filter.size === 0) return true;
  const lane = laneForFrame(game, frameNumber);
  return lane != null && filter.has(lane);
}

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
  lowGame: number | null;
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
export function calculateStats(sessions: SessionSummary[], selectedLanes?: string[]): BowlingStats {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const allGames = sessions.flatMap((s) =>
    s.games.map((g) => ({ alley: s.session.alley_name, game: g as GameWithFrames }))
  );

  const completedScores: number[] = [];
  const alleyMap = new Map<string, number[]>();
  let strikeOpps = 0;
  let strikes = 0;
  let spareOpps = 0;
  let spares = 0;

  for (const { alley, game } of allGames) {
    // Avg/High are whole-game scores: include a game if it touched a selected lane.
    if (typeof game.final_score === "number" && gameTouchesLanes(game, filter)) {
      completedScores.push(game.final_score);
      if (!alleyMap.has(alley)) alleyMap.set(alley, []);
      alleyMap.get(alley)!.push(game.final_score);
    }

    // Strike/spare rates are per-frame: count only frames on selected lanes.
    for (const frame of game.frames) {
      if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;
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
    lowGame: completedScores.length ? Math.min(...completedScores) : null,
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

/** A frame left with a real (non-baby) split is not a spare opportunity. */
function isRealSplit(standing: PinNumber[]): boolean {
  return isSplit(standing) && !isBabySplit(standing);
}

function tallyFrame(frame: Frame): FrameTally {
  if (frame.frame_number === 10) return tallyTenthFrame(frame);

  // Frames 1-9: one first-ball strike opportunity.
  const strike = isStrike(frame);
  const t: FrameTally = { strikeOpps: 1, strikes: strike ? 1 : 0, spareOpps: 0, spares: 0 };

  if (!strike && frame.shots[1] && !isRealSplit(frame.shots[0].pins_standing)) {
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
  } else if (!isRealSplit(shot1Standing)) {
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

export function calculateCommonLeaves(
  sessions: SessionSummary[],
  selectedLanes?: string[]
): LeaveStats[] {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const leaveMap = new Map<string, LeaveStats>();

  const allFrames = sessions.flatMap((s) =>
    s.games.flatMap((g) =>
      g.frames.filter((f) => frameOnSelectedLane(g, f.frame_number, filter))
    )
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
    .sort(
      (a, b) =>
        b.attempts - a.attempts ||
        a.pins.length - b.pins.length ||
        comparePins(a.pins, b.pins)
    );
}

// ---------------------------------------------------------------------------
// Ball usage
// ---------------------------------------------------------------------------

export interface BallUsage {
  ballId: number;
  name: string;
  frames: number;
  games: number;
  /** Catalog artwork for the row, when the ball is linked to a catalog entry. */
  imageThumb: string | null;
  brand: string | null;
}

/**
 * Frames and games each ball was thrown in, across all sessions. A frame counts
 * once per ball used in it (a frame can use two balls — e.g. a strike ball then a
 * spare ball); a game counts once if the ball appears in any of its frames.
 * Respects the lane filter (frames on unselected lanes are ignored). Shots with no
 * `ball_id` are skipped. Sorted by frames thrown, descending. Pure.
 */
export function calculateBallUsage(
  sessions: SessionSummary[],
  balls: Ball[],
  selectedLanes?: string[]
): BallUsage[] {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const byId = new Map(balls.filter((b) => b.id != null).map((b) => [b.id!, b]));
  const frames = new Map<number, number>();
  const games = new Map<number, number>();

  for (const s of sessions) {
    for (const game of s.games) {
      const inThisGame = new Set<number>();
      for (const frame of game.frames) {
        if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;
        const inThisFrame = new Set<number>();
        for (const shot of frame.shots) {
          if (shot.ball_id != null) inThisFrame.add(shot.ball_id);
        }
        for (const id of inThisFrame) {
          frames.set(id, (frames.get(id) ?? 0) + 1);
          inThisGame.add(id);
        }
      }
      for (const id of inThisGame) games.set(id, (games.get(id) ?? 0) + 1);
    }
  }

  return [...frames.entries()]
    .map(([ballId, frameCount]) => ({
      ballId,
      name: byId.get(ballId)?.name ?? `Ball #${ballId}`,
      frames: frameCount,
      games: games.get(ballId) ?? 0,
      imageThumb: byId.get(ballId)?.catalog_snapshot?.imageThumb ?? null,
      brand: byId.get(ballId)?.catalog_snapshot?.brand ?? null
    }))
    .sort((a, b) => b.frames - a.frames || a.name.localeCompare(b.name));
}

/** Element-wise numeric compare of two ascending pin lists. */
function comparePins(a: PinNumber[], b: PinNumber[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
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
      const wanted = filter.laneNumber.toLowerCase();
      const filteredGames = s.games.filter((g) => {
        const lanes = g.lanes ?? (g.lane_number ? [g.lane_number] : []);
        return lanes.some((l) => l.toLowerCase() === wanted);
      });
      if (filteredGames.length === 0) return acc;
      acc.push({ session: s.session, games: filteredGames });
      return acc;
    }

    acc.push(s);
    return acc;
  }, []);
}
