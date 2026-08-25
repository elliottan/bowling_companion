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

/** A full rack. */
const PINS = 10;

/**
 * What one open frame gives up, near enough (ADR-059). A converted spare is
 * worth ten plus the next ball, and an open is worth what was on the deck, so
 * the true figure depends on the leave and the ball after it. This is the
 * bowler's rule of thumb, applied as a rule of thumb: the screen says "about".
 */
const PINS_PER_OPEN = 11;

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
  /** Pins knocked down by the average fresh-rack ball, to one decimal. The
   *  same population as strike and pocket, so the three describe one ball. */
  firstBallAverage: number | null;
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
  let firstBallPins = 0;
  let firstBalls = 0;

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
        firstBalls++;
        firstBallPins += PINS - shot.pins_standing.length;
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
    firstBallAverage: firstBalls === 0 ? null : Math.round((firstBallPins / firstBalls) * 10) / 10,
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

/**
 * Leaves made in a frame: one per fresh-rack ball that did not strike, paired
 * with whether a ball followed it and whether that ball cleared it.
 *
 * Reading `shots[0]` alone misses the 10th frame, where a bonus ball is thrown
 * at a full rack and can leave pins of its own. A 10th of strike, strike, 9
 * makes a leave on the third ball, and it used to be counted nowhere.
 *
 * `chance` is false when no ball followed the leave: the 10th frame's last
 * ball, which no spare attempt can follow, and a frame still being bowled.
 * Both are leaves that happened, and neither is a spare missed, so they count
 * as attempts but stay out of the conversion rate.
 */
function leaveEvents(
  frame: Frame
): Array<{ shot: Shot; leave: PinNumber[]; chance: boolean; converted: boolean }> {
  const out: Array<{ shot: Shot; leave: PinNumber[]; chance: boolean; converted: boolean }> = [];
  for (const index of freshRackShotIndices(frame.shots)) {
    const shot = frame.shots[index];
    if (shot.pins_standing.length === 0) continue; // struck, nothing left
    const next = frame.shots[index + 1];
    out.push({
      shot,
      leave: [...shot.pins_standing].sort((a, b) => a - b) as PinNumber[],
      chance: Boolean(next),
      converted: Boolean(next && next.pins_standing.length === 0)
    });
  }
  return out;
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
  /** Times this leave was left, every one of them. */
  attempts: number;
  /** Attempts that a ball followed, so the spare could be made or missed.
   *  Fewer than `attempts` when the leave came off the 10th frame's last ball
   *  or off a frame still in progress. */
  chances: number;
  conversions: number;
  /** conversions / chances, null when there was never a chance. */
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
    for (const { leave, chance, converted } of leaveEvents(frame)) {
      const key = leave.join("-");
      if (!leaveMap.has(key)) {
        leaveMap.set(key, {
          pins: leave,
          attempts: 0,
          chances: 0,
          conversions: 0,
          conversionPct: null
        });
      }
      const entry = leaveMap.get(key)!;
      entry.attempts++;
      if (chance) entry.chances++;
      if (converted) entry.conversions++;
    }
  }

  return [...leaveMap.values()]
    .map((entry) => ({
      ...entry,
      conversionPct: rate(entry.conversions, entry.chances)
    }))
    .sort(
      (a, b) =>
        b.attempts - a.attempts ||
        a.pins.length - b.pins.length ||
        comparePins(a.pins, b.pins)
    );
}

// ---------------------------------------------------------------------------
// Ball performance
// ---------------------------------------------------------------------------

/** One session's contribution to a ball's game-number column, so the cell can
 *  name the games it is made of and link to them. */
export interface BallGameSession {
  sessionId: number;
  gameId: number;
  date: string;
  alley: string;
  /** What the night was: the session's own description ("SIA Bilateral"). */
  event?: string;
  /** The lanes that game was bowled on, in the order they are played. */
  lanes: string[];
  oilPattern?: string;
  firstBalls: number;
  pocket: number;
  strikes: number;
  /** Strikes off a pocket hit, so a row can report carry as well as pocket. */
  pocketStrikes: number;
}

export interface BallGameCell {
  gameNumber: number;
  firstBalls: number;
  pocket: number;
  strikes: number;
  /** Strikes thrown off a pocket hit, the numerator of carry. */
  pocketStrikes: number;
  /** The games behind this cell, newest session first. Games with no id are
   *  left out: there is nothing to navigate to. */
  sessions: BallGameSession[];
}

export interface BallPerformance {
  ballId: number;
  name: string;
  imageThumb: string | null;
  brand: string | null;
  firstBalls: number;
  /** Rates across every game in view. Raw, like the per-game cells: one number
   *  per ball means one definition of that number (ADR-048). */
  pocketPct: number | null;
  carryPct: number | null;
  strikePct: number | null;
  byGame: BallGameCell[];
  leaves: LeaveStats[];
}

/** Fewest fresh-rack balls a ball needs before its rate is allowed to lead a
 *  column. Under this a single lucky night wins, which is exactly the reading
 *  ADR-047 shrinks the aggregate rates to avoid. */
export const RATE_LEADER_MIN_BALLS = 10;

/** The best rate in each column, or `null` where there is nothing to crown. */
export interface RateLeaders {
  pocketPct: number | null;
  carryPct: number | null;
  strikePct: number | null;
}

export interface BallPerformanceReport {
  balls: BallPerformance[];
  /** Fresh-rack balls thrown with no ball recorded, so attributable to nothing. */
  unattributed: number;
}

/**
 * The leading rate in each column, for balls with enough behind them.
 *
 * Values rather than a winning ball, so a tie lights every ball that ties
 * rather than picking one of them arbitrarily.
 *
 * Nothing leads until two balls qualify: "best of one" is not a comparison,
 * and a lone highlighted row reads as a recommendation the data cannot make.
 */
export function findRateLeaders(balls: BallPerformance[]): RateLeaders {
  const eligible = balls.filter((b) => b.firstBalls >= RATE_LEADER_MIN_BALLS);
  if (eligible.length < 2) return { pocketPct: null, carryPct: null, strikePct: null };

  const best = (pick: (b: BallPerformance) => number | null): number | null => {
    const values = eligible.flatMap((b) => {
      const value = pick(b);
      return value === null ? [] : [value];
    });
    return values.length === 0 ? null : Math.max(...values);
  };

  return {
    pocketPct: best((b) => b.pocketPct),
    carryPct: best((b) => b.carryPct),
    strikePct: best((b) => b.strikePct)
  };
}

/** A cell under construction: its own totals plus one entry per game feeding it. */
interface CellAccumulator {
  cell: Omit<BallGameCell, "sessions">;
  sessions: Map<number, BallGameSession>;
}

interface BallAccumulator {
  firstBalls: number;
  pocket: number;
  pocketStrikes: number;
  strikes: number;
  byGame: Map<number, CellAccumulator>;
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

/** One night on the History trend line: its average, and the games behind it. */
export interface SessionTrendPoint {
  sessionId?: number;
  date: string;
  alley: string;
  event?: string;
  average: number;
  scores: number[];
}

/**
 * Average by session, oldest first, for the History trend.
 *
 * The lane filter applies per game, not per session: a score belongs to the
 * pair it was bowled on and cannot be split below that, so a game that never
 * touched a selected lane leaves the line, and a session left with no games
 * leaves it entirely. Sessions with nothing scored yet are dropped rather than
 * plotted at zero.
 */
export function calculateSessionTrend(
  sessions: SessionSummary[],
  selectedLanes?: string[]
): SessionTrendPoint[] {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;

  return [...sessions]
    .sort((a, b) => a.session.date.localeCompare(b.session.date))
    .flatMap((s) => {
      const scores = s.games
        .filter((g) => !filter || gameLanes(g).some((l) => filter.has(l)))
        .flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
      if (scores.length === 0) return [];
      return [
        {
          sessionId: s.session.id,
          date: s.session.date,
          alley: s.session.alley_name,
          event: s.session.description,
          average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
          scores
        }
      ];
    });
}

/**
 * Per-ball pocket, carry and strike rates, broken out by game number, plus the
 * leaves each ball produced (ADR-047, amended by ADR-048).
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

  for (const s of sessions) {
    for (const game of s.games) {
      for (const frame of game.frames) {
        if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;

        for (const shot of freshRackShots(frame)) {
          const struck = clears(shot.pins_standing);
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

          const slot = entry.byGame.get(game.game_number) ?? {
            cell: {
              gameNumber: game.game_number,
              firstBalls: 0,
              pocket: 0,
              strikes: 0,
              pocketStrikes: 0
            },
            sessions: new Map<number, BallGameSession>()
          };
          slot.cell.firstBalls++;
          if (struck) slot.cell.strikes++;
          if (pocket) slot.cell.pocket++;
          if (pocket && struck) slot.cell.pocketStrikes++;

          if (s.session.id != null && game.id != null) {
            const contribution = slot.sessions.get(game.id) ?? {
              sessionId: s.session.id,
              gameId: game.id,
              date: s.session.date,
              alley: s.session.alley_name,
              event: s.session.description,
              lanes: gameLanes(game),
              oilPattern: s.session.oil_pattern,
              firstBalls: 0,
              pocket: 0,
              strikes: 0,
              pocketStrikes: 0
            };
            contribution.firstBalls++;
            if (struck) contribution.strikes++;
            if (pocket) contribution.pocket++;
            if (pocket && struck) contribution.pocketStrikes++;
            slot.sessions.set(game.id, contribution);
          }
          entry.byGame.set(game.game_number, slot);
        }

        // A leave belongs to the ball that made it, which in the 10th is not
        // always the ball that threw shot 1.
        for (const { shot, leave, chance, converted } of leaveEvents(frame)) {
          if (shot.ball_id == null) continue;
          const entry = acc.get(shot.ball_id);
          if (!entry) continue;
          const key = leave.join("-");
          const stat = entry.leaves.get(key) ?? {
            pins: leave,
            attempts: 0,
            chances: 0,
            conversions: 0,
            conversionPct: null
          };
          stat.attempts++;
          if (chance) stat.chances++;
          if (converted) stat.conversions++;
          entry.leaves.set(key, stat);
        }
      }
    }
  }

  const perBall = [...acc.entries()].map(([ballId, e]) => ({
    ballId,
    name: byId.get(ballId)?.name ?? `Ball #${ballId}`,
    imageThumb: byId.get(ballId)?.catalog_snapshot?.imageThumb ?? null,
    brand: byId.get(ballId)?.catalog_snapshot?.brand ?? null,
    firstBalls: e.firstBalls,
    pocketPct: rate(e.pocket, e.firstBalls),
    carryPct: rate(e.pocketStrikes, e.pocket),
    strikePct: rate(e.strikes, e.firstBalls),
    byGame: [...e.byGame.values()]
      .map((slot) => ({
        ...slot.cell,
        sessions: [...slot.sessions.values()].sort((x, y) => y.date.localeCompare(x.date))
      }))
      .sort((a, b) => a.gameNumber - b.gameNumber),
    leaves: [...e.leaves.values()]
      .map((l) => ({ ...l, conversionPct: rate(l.conversions, l.chances) }))
      .sort(
        (a, b) =>
          b.attempts - a.attempts ||
          a.pins.length - b.pins.length ||
          comparePins(a.pins, b.pins)
      )
  }));

  // Most-thrown first. Sorting by rate puts the ball thrown once and struck
  // with above the ball with three hundred balls behind it (ADR-048).
  return {
    balls: perBall.sort((a, b) => b.firstBalls - a.firstBalls || a.name.localeCompare(b.name)),
    unattributed
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
  /** Keep only this position in the night: every third game, say. Filtering the
   *  games here rather than teaching each calculator about it is what lets the
   *  whole Stats screen slice by game with no calculator changes. */
  gameNumber?: number;
}

export function filterSessionsBy(
  sessions: SessionSummary[],
  filter: FilterOptions
): SessionSummary[] {
  return sessions.reduce<SessionSummary[]>((acc, s) => {
    if (filter.gameNumber != null) {
      const games = s.games.filter((g) => g.game_number === filter.gameNumber);
      if (games.length === 0) return acc;
      s = { session: s.session, games };
    }

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

// ---------------------------------------------------------------------------
// Open frames
// ---------------------------------------------------------------------------

/** One leave, and how often it goes open. */
export interface OpenFrameLeave {
  pins: PinNumber[];
  /** Times this leave was thrown at, so it could be made or missed. */
  chances: number;
  conversions: number;
  misses: number;
  conversionPct: number | null;
  /** Opens a game. What the row is read on: a raw count of 10-pin misses says
   *  as much about being right-handed as about shooting spares. */
  perGame: number | null;
}

/** Opens of one kind, against the games they happened in. */
export interface OpenFrameKind {
  openFrames: number;
  perGame: number | null;
}

/** One night, and how often it went open. */
export interface OpenFrameTrendPoint {
  sessionId?: number;
  date: string;
  alley: string;
  games: number;
  openFrames: number;
  perGame: number;
}

export interface OpenFrameReport {
  /** Completed games in view: the denominator of every per-game figure here. */
  games: number;
  /** Every open frame, whatever left it open. */
  openFrames: number;
  openFramesPerGame: number | null;
  /** `openFramesPerGame` at `PINS_PER_OPEN`. A rule of thumb, labelled as one. */
  pinsLostPerGame: number | null;
  /** The same opens, split by what caused them. They sum to `openFrames`. */
  makeable: OpenFrameKind;
  washout: OpenFrameKind;
  split: OpenFrameKind;
  /** Makeable leaves only, most often first. Splits belong to the first ball,
   *  so ranking them among spares you missed would be reading the wrong page. */
  leaves: OpenFrameLeave[];
  /** By session, oldest first. Every open, matching the headline. */
  trend: OpenFrameTrendPoint[];
}

/**
 * How often frames go open, on what, and roughly what that costs (ADR-058,
 * amended by ADR-059).
 *
 * The headline counts **every** open frame, because that is what an open frame
 * is on the scoresheet and a bowler counting their own night counts all of
 * them. The three kinds are broken out under it rather than filtered away, so
 * a night full of splits reads as a first-ball problem instead of quietly
 * shrinking the number.
 *
 * The leave list stays makeable-only: it is a list of spares to go and work
 * on, and no amount of spare shooting removes a 7-10.
 *
 * Only completed games count, matching `calculateStats`. A frame in a game
 * still being bowled is unfinished, not open.
 */
export function calculateOpenFrames(
  sessions: SessionSummary[],
  selectedLanes?: string[]
): OpenFrameReport {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const leaveMap = new Map<string, OpenFrameLeave>();
  const trend: OpenFrameTrendPoint[] = [];
  let games = 0;
  let openFrames = 0;
  let makeable = 0;
  let washout = 0;
  let split = 0;

  for (const s of [...sessions].sort((a, b) => a.session.date.localeCompare(b.session.date))) {
    let sessionGames = 0;
    let sessionOpens = 0;

    for (const game of s.games) {
      if (typeof game.final_score !== "number") continue;
      if (!gameTouchesLanes(game, filter)) continue;
      sessionGames++;

      for (const frame of game.frames) {
        if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;
        for (const { leave, chance, converted } of leaveEvents(frame)) {
          if (!chance) continue;

          const kind = openFrameKind(leave);
          if (!converted) {
            sessionOpens++;
            if (kind === "washout") washout++;
            else if (kind === "split") split++;
            else makeable++;
          }

          // The list is the spare game, so splits and washouts stay off it.
          if (kind !== "makeable") continue;
          const key = leave.join("-");
          if (!leaveMap.has(key)) {
            leaveMap.set(key, {
              pins: leave,
              chances: 0,
              conversions: 0,
              misses: 0,
              conversionPct: null,
              perGame: null
            });
          }
          const entry = leaveMap.get(key)!;
          entry.chances++;
          if (converted) entry.conversions++;
          else entry.misses++;
        }
      }
    }

    if (sessionGames === 0) continue;
    games += sessionGames;
    openFrames += sessionOpens;
    trend.push({
      sessionId: s.session.id,
      date: s.session.date,
      alley: s.session.alley_name,
      games: sessionGames,
      openFrames: sessionOpens,
      perGame: round1(sessionOpens / sessionGames)
    });
  }

  const leaves = [...leaveMap.values()]
    .map((l) => ({
      ...l,
      conversionPct: rate(l.conversions, l.chances),
      perGame: perGame(l.misses, games)
    }))
    .filter((l) => l.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.chances - a.chances || comparePins(a.pins, b.pins));

  return {
    games,
    openFrames,
    openFramesPerGame: perGame(openFrames, games),
    pinsLostPerGame: games === 0 ? null : Math.round((openFrames / games) * PINS_PER_OPEN),
    makeable: { openFrames: makeable, perGame: perGame(makeable, games) },
    washout: { openFrames: washout, perGame: perGame(washout, games) },
    split: { openFrames: split, perGame: perGame(split, games) },
    leaves,
    trend
  };
}

/** Which of the three a leave belongs to. Exactly one, since a standing head
 *  pin and a missing one are exclusive. Matches the split the leaves card on
 *  Stats already draws. */
function openFrameKind(leave: PinNumber[]): "makeable" | "washout" | "split" {
  if (isWashout(leave)) return "washout";
  if (isSplit(leave) && !isBabySplit(leave)) return "split";
  return "makeable";
}

/** One decimal. `null` when there is nothing to divide by. */
function perGame(total: number, games: number): number | null {
  if (games === 0) return null;
  return round1(total / games);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Game-number trend
// ---------------------------------------------------------------------------

/** One game slot of the night: every first game, every second game, and so on. */
export interface GameNumberStats {
  gameNumber: number;
  /** Completed games in this slot. Thin slots are real and stay in the list. */
  games: number;
  average: number | null;
  strikePct: number | null;
  sparePct: number | null;
  /** Same definitions as `calculateStats`, so a slot reads against the whole. */
  pocketPct: number | null;
  carryPct: number | null;
}

/**
 * How you bowl by position in the night (ADR-056): every game 1 against every
 * game 2, and so on, oldest slot first.
 *
 * This is not the same question as the session trend, which asks whether you
 * are improving over months. This one holds the calendar still and asks what
 * happens between the first frame of the night and the last.
 *
 * The slots thin out fast: most nights are three games, so game 4 and beyond
 * carry a handful between them. The count rides on every row rather than
 * being hidden behind a rate, and callers decide what is too thin to show.
 */
export function calculateGameNumberTrend(
  sessions: SessionSummary[],
  selectedLanes?: string[],
  handedness: Handedness = "right"
): GameNumberStats[] {
  const filter = selectedLanes && selectedLanes.length ? new Set(selectedLanes) : undefined;
  const slots = new Map<
    number,
    {
      scores: number[];
      strikeOpps: number;
      strikes: number;
      spareOpps: number;
      spares: number;
      pocketHits: number;
      pocketStrikes: number;
    }
  >();

  for (const s of sessions) {
    for (const game of s.games) {
      if (!gameTouchesLanes(game, filter)) continue;
      const slot =
        slots.get(game.game_number) ??
        {
          scores: [],
          strikeOpps: 0,
          strikes: 0,
          spareOpps: 0,
          spares: 0,
          pocketHits: 0,
          pocketStrikes: 0
        };
      slots.set(game.game_number, slot);

      if (typeof game.final_score === "number") slot.scores.push(game.final_score);

      for (const frame of game.frames) {
        if (!frameOnSelectedLane(game, frame.frame_number, filter)) continue;
        const tally = tallyFrame(frame);
        slot.strikeOpps += tally.strikeOpps;
        slot.strikes += tally.strikes;
        slot.spareOpps += tally.spareOpps;
        slot.spares += tally.spares;
        for (const shot of freshRackShots(frame)) {
          if (!resolvePocketHit(shot, handedness)) continue;
          slot.pocketHits++;
          if (shot.pins_standing.length === 0) slot.pocketStrikes++;
        }
      }
    }
  }

  return [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gameNumber, slot]) => ({
      gameNumber,
      games: slot.scores.length,
      average: average(slot.scores),
      strikePct: rate(slot.strikes, slot.strikeOpps),
      sparePct: rate(slot.spares, slot.spareOpps),
      pocketPct: rate(slot.pocketHits, slot.strikeOpps),
      carryPct: rate(slot.pocketStrikes, slot.pocketHits)
    }));
}
