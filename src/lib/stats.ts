import { isSpare } from "./scoring";
import { isBabySplit, isSplit, isWashout, resolvePocketHit } from "./pins";
import { freshRackShotIndices, laneForFrame } from "./lanes";
import type {
  Ball,
  Frame,
  Game,
  Handedness,
  PinNumber,
  SessionSummary,
  Shot
} from "../types/bowling";

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
  /** Share of fresh-rack balls that found the pocket (ADR-046). */
  pocketPct: number | null;
  /** Share of pocket hits that struck: the carry rate. Strikes the bowler
   *  flagged as crossovers are excluded from both sides, so this stays a rate
   *  of pocket balls carrying and cannot exceed 100. */
  carryPct: number | null;
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
 * non-strike frame in which a second ball was thrown at a makeable leave —
 * real splits and washouts are excluded (ADR-036).
 */
export function calculateStats(
  sessions: SessionSummary[],
  selectedLanes?: string[],
  handedness: Handedness = "right"
): BowlingStats {
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
  let pocketHits = 0;
  let pocketStrikes = 0;

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
      for (const shot of freshRackShots(frame)) {
        if (!resolvePocketHit(shot, handedness)) continue;
        pocketHits++;
        if (shot.pins_standing.length === 0) pocketStrikes++;
      }
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
    pocketPct: rate(pocketHits, strikeOpps),
    carryPct: rate(pocketStrikes, pocketHits),
    byAlley
  };
}

interface FrameTally {
  strikeOpps: number;
  strikes: number;
  spareOpps: number;
  spares: number;
}

/**
 * Spare % measures makeable leaves only: a real (non-baby) split or a washout
 * is not a spare opportunity. See ADR-036.
 */
function isUnmakeable(standing: PinNumber[]): boolean {
  if (isWashout(standing)) return true;
  return isSplit(standing) && !isBabySplit(standing);
}

/**
 * The balls in a frame that were thrown at a full rack: shot 1 always, plus the
 * 10th frame's bonus balls whenever the previous ball cleared the deck. These
 * are the strike opportunities, and equally the pocket opportunities, since a
 * shot at a leave has no pocket to hit. Shares `freshRackShotIndices` with the
 * seeding rules so "fresh rack" means one thing in this codebase.
 */
function freshRackShots(frame: Frame): Shot[] {
  return freshRackShotIndices(frame.shots).map((i) => frame.shots[i]);
}

function tallyFrame(frame: Frame): FrameTally {
  const fresh = freshRackShots(frame);
  const t: FrameTally = {
    strikeOpps: fresh.length,
    strikes: fresh.filter((s) => clears(s.pins_standing)).length,
    spareOpps: 0,
    spares: 0
  };

  const [s1, s2] = frame.shots;
  if (!s1 || !s2) return t;

  // A spare attempt exists only when ball 1 left a makeable leave. In the 10th
  // that is the same test: ball 2 after a strike is a fresh rack, not a spare.
  if (!clears(s1.pins_standing) && !isUnmakeable(s1.pins_standing)) {
    t.spareOpps = 1;
    if (frame.frame_number === 10) {
      if (clears2(s1.pins_standing, s2.pins_standing)) t.spares = 1;
    } else if (isSpare(frame)) {
      t.spares = 1;
    }
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

// ---------------------------------------------------------------------------
// Ball performance
// ---------------------------------------------------------------------------

/** Prior weight for the shrunk aggregate: a ball needs this many fresh-rack
 *  balls before its own rate outweighs the bowler's baseline. */
const SHRINKAGE_FRAMES = 30;

export interface BallGameCell {
  gameNumber: number;
  firstBalls: number;
  pocket: number;
  strikes: number;
  /** Strikes thrown off a pocket hit, the numerator of carry. */
  pocketStrikes: number;
}

export interface BallPerformance {
  ballId: number;
  name: string;
  imageThumb: string | null;
  brand: string | null;
  firstBalls: number;
  pocketPct: number | null;
  carryPct: number | null;
  strikePct: number | null;
  /** Strike rate pulled toward the bowler's overall rate by SHRINKAGE_FRAMES.
   *  Sorting on the raw rate would float a ball thrown twice to the top. */
  adjustedStrikePct: number | null;
  /** Raw per-game cells, unsmoothed on purpose: at 4 to 8 balls a cell there is
   *  no signal to smooth, only a shape to eyeball. */
  byGame: BallGameCell[];
  leaves: LeaveStats[];
}

export interface BallPerformanceReport {
  balls: BallPerformance[];
  /** Fresh-rack balls thrown with no ball recorded, so attributable to nothing. */
  unattributed: number;
  baselineStrikePct: number | null;
}

interface BallAccumulator {
  firstBalls: number;
  pocket: number;
  pocketStrikes: number;
  strikes: number;
  byGame: Map<number, BallGameCell>;
  leaves: Map<string, LeaveStats>;
}

function emptyAccumulator(): BallAccumulator {
  return {
    firstBalls: 0,
    pocket: 0,
    pocketStrikes: 0,
    strikes: 0,
    byGame: new Map(),
    leaves: new Map()
  };
}

/**
 * Per-ball pocket, carry and strike rates, broken out by game number, plus the
 * leaves each ball produced (ADR-047).
 *
 * Only fresh-rack balls count, and only those with a `ball_id`; the rest are
 * reported as `unattributed` rather than silently dropped, so a half-tagged
 * history reads as incomplete instead of authoritative.
 *
 * Ball choice is not random. A ball pulled only when the lanes are burnt will
 * show a worse rate for reasons that are nothing to do with the ball. These
 * numbers describe what happened, not what would have happened with a
 * different ball.
 */
export function calculateBallPerformance(
  sessions: SessionSummary[],
  balls: Ball[],
  selectedLanes?: string[],
  handedness: Handedness = "right"
): BallPerformanceReport {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const byId = new Map(balls.filter((b) => b.id != null).map((b) => [b.id!, b]));
  const acc = new Map<number, BallAccumulator>();
  let unattributed = 0;
  let totalFirstBalls = 0;
  let totalStrikes = 0;

  for (const s of sessions) {
    for (const game of s.games) {
      for (const frame of game.frames) {
        if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;

        for (const shot of freshRackShots(frame)) {
          const struck = clears(shot.pins_standing);
          totalFirstBalls++;
          if (struck) totalStrikes++;

          if (shot.ball_id == null) {
            unattributed++;
            continue;
          }
          if (!acc.has(shot.ball_id)) acc.set(shot.ball_id, emptyAccumulator());
          const entry = acc.get(shot.ball_id)!;
          const pocket = resolvePocketHit(shot, handedness);
          entry.firstBalls++;
          if (struck) entry.strikes++;
          if (pocket) entry.pocket++;
          if (pocket && struck) entry.pocketStrikes++;

          const cell = entry.byGame.get(game.game_number) ?? {
            gameNumber: game.game_number,
            firstBalls: 0,
            pocket: 0,
            strikes: 0,
            pocketStrikes: 0
          };
          cell.firstBalls++;
          if (struck) cell.strikes++;
          if (pocket) cell.pocket++;
          if (pocket && struck) cell.pocketStrikes++;
          entry.byGame.set(game.game_number, cell);
        }

        // Leaves belong to the ball that made them: the first ball of the frame.
        const first = frame.shots[0];
        if (!first || first.ball_id == null) continue;
        if (first.pins_standing.length === 0) continue;
        const entry = acc.get(first.ball_id);
        if (!entry) continue;
        const leave = [...first.pins_standing].sort((a, b) => a - b) as PinNumber[];
        const key = leave.join("-");
        const stat = entry.leaves.get(key) ?? {
          pins: leave,
          attempts: 0,
          conversions: 0,
          conversionPct: null
        };
        stat.attempts++;
        if (frame.shots[1] && frame.shots[1].pins_standing.length === 0) stat.conversions++;
        entry.leaves.set(key, stat);
      }
    }
  }

  const baseline = totalFirstBalls > 0 ? totalStrikes / totalFirstBalls : null;

  const perBall = [...acc.entries()].map(([ballId, e]) => ({
    ballId,
    name: byId.get(ballId)?.name ?? `Ball #${ballId}`,
    imageThumb: byId.get(ballId)?.catalog_snapshot?.imageThumb ?? null,
    brand: byId.get(ballId)?.catalog_snapshot?.brand ?? null,
    firstBalls: e.firstBalls,
    pocketPct: rate(e.pocket, e.firstBalls),
    carryPct: rate(e.pocketStrikes, e.pocket),
    strikePct: rate(e.strikes, e.firstBalls),
    adjustedStrikePct:
      baseline == null
        ? null
        : Math.round(
            ((e.strikes + SHRINKAGE_FRAMES * baseline) /
              (e.firstBalls + SHRINKAGE_FRAMES)) *
              100
          ),
    byGame: [...e.byGame.values()].sort((a, b) => a.gameNumber - b.gameNumber),
    leaves: [...e.leaves.values()]
      .map((l) => ({ ...l, conversionPct: rate(l.conversions, l.attempts) }))
      .sort((a, b) => b.attempts - a.attempts || comparePins(a.pins, b.pins))
  }));

  return {
    balls: perBall.sort(
      (a, b) =>
        (b.adjustedStrikePct ?? 0) - (a.adjustedStrikePct ?? 0) ||
        b.firstBalls - a.firstBalls ||
        a.name.localeCompare(b.name)
    ),
    unattributed,
    baselineStrikePct: baseline == null ? null : Math.round(baseline * 100)
  };
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
