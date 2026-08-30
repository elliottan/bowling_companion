import { freshRackShotIndices } from "./lanes";
import {
  calculateBallPerformance,
  calculateGameNumberMetrics,
  calculateStats,
  filterSessionsBy
} from "./stats";
import type { Ball, Frame, Game, Handedness, SessionSummary } from "../types/bowling";

/**
 * What your own history says about somewhere you are about to bowl (ADR-064).
 *
 * Every finding here is the same shape: the slice you picked against the rest
 * of your history, reported only when the gap is worth mentioning and there is
 * enough behind it to mean anything. Nothing is predicted and nothing is
 * recommended: ball choice is not random, and a ball you only reach for when
 * the lanes are good will look better here for reasons that are nothing to do
 * with the ball. These describe what happened.
 *
 * The module returns findings, not sentences. The copy belongs to the screen
 * (docs/DESIGN-LANGUAGE.md §8), and keeping it there means the thresholds and
 * the ranking can be tested without asserting on wording.
 */

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** Below this the slice is a couple of nights and every comparison in here is
 *  noise. The screen says what it is waiting for instead. */
export const MIN_SLICE_GAMES = 6;
/** The rest of your history has to be worth comparing against too. */
export const MIN_BASELINE_GAMES = 6;

/** A slice and a baseline, both at their floor. Below this every comparison in
 *  a briefing is still gathering, so there is nothing yet to send a reader to
 *  the screen for. */
export const MIN_BRIEFING_GAMES = MIN_SLICE_GAMES + MIN_BASELINE_GAMES;

/** Differences smaller than these are not worth a reader's attention. Chosen in
 *  bowling terms rather than statistical ones: five pins is a ball change, five
 *  points of spare rate is a frame a night. */
const MIN_PIN_DELTA = 5;
const MIN_RATE_DELTA = 5;
/** A game slot has to be further out than an ordinary night's spread. */
const MIN_SLOT_DELTA = 8;
/** One lane of a pair beating the other by less than this is which end you
 *  happened to start on. */
const MIN_LANE_DELTA = 8;

/** A ball needs this many fresh-rack balls in the slice before it can be
 *  compared to another one. Matches the ball table's own floor. */
const MIN_BALL_FIRST_BALLS = 20;
/** A game slot needs this many games before it is a pattern rather than a night. */
const MIN_SLOT_GAMES = 3;
/** A lane needs this many games before its strike rate means anything. */
const MIN_LANE_GAMES = 4;

/** Comparisons shown at once. The fourth is a rank nobody reads. */
const MAX_CALLOUTS = 3;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface BriefingFilter {
  alley?: string;
  pattern?: string;
}

export type BriefingFinding =
  /** What you average here against what you average everywhere else. */
  | {
      kind: "expectation";
      average: number;
      baseline: number;
      delta: number;
      games: number;
    }
  /** The ball that carried best here, and the next one down. */
  | {
      kind: "ball";
      name: string;
      carryPct: number;
      firstBalls: number;
      runnerUp: string;
      runnerUpCarryPct: number;
    }
  /** Which game of the night treats you best here, and which worst. */
  | {
      kind: "gameSlot";
      bestGame: number;
      bestAverage: number;
      worstGame: number;
      worstAverage: number;
      games: number;
    }
  /** Spare conversion here against everywhere else. */
  | {
      kind: "spares";
      sparePct: number;
      baseline: number;
      delta: number;
      games: number;
    }
  /** One lane of the pair against the other. */
  | {
      kind: "laneBias";
      lane: string;
      strikePct: number;
      otherLane: string;
      otherStrikePct: number;
      games: number;
    };

/** The line you actually played last time you were here. Context rather than a
 *  comparison, so it sits outside the ranked list. */
export interface LastTimeHere {
  sessionId?: number;
  date: string;
  alley: string;
  /** Games that night, and what they averaged. */
  games: number;
  average: number | null;
  /** The ball most of that night's fresh-rack balls were thrown with. */
  ballName?: string;
  /** Median stance and target across those balls, so one stray shot does not
   *  become the remembered line. */
  stance?: number;
  target?: number;
}

/**
 * A rule that could not run, and what it is short of.
 *
 * Most of these rules need TWO of something, each with a floor of its own: two
 * balls with enough first balls, two game slots with enough games. So `have`
 * and `need` count the qualifying things and `each` carries the floor. Saying
 * "needs 20 first balls, best so far is 150" was the first version, and it
 * reads as nonsense because the shortfall was never the first balls.
 */
export interface BriefingGap {
  /** `slice` is the whole screen being short, rather than one rule. */
  kind: BriefingFinding["kind"] | "slice";
  have: number;
  need: number;
  /** Floor each of the `need` things has to clear, where there is one. */
  each?: number;
}

export interface Briefing {
  sessions: number;
  games: number;
  /** Ranked and capped. Empty when nothing cleared the gates. */
  callouts: BriefingFinding[];
  lastTime: LastTimeHere | null;
  gathering: BriefingGap[];
}

/**
 * Priority, not score.
 *
 * Ranking across rules needs one currency, and the only way to get pins and
 * rate points into the same units is to invent a conversion between them.
 * Every number on the screen would then inherit that guess. So the order is
 * fixed, by how much use a finding is before the first ball: the ball is
 * chosen in the car park, what you average sets expectations, the game slot
 * says when to pay attention, and the rest is detail.
 */
const PRIORITY: BriefingFinding["kind"][] = [
  "ball",
  "expectation",
  "gameSlot",
  "spares",
  "laneBias"
];

export function buildBriefing(
  sessions: SessionSummary[],
  balls: Ball[],
  filter: BriefingFilter,
  handedness: Handedness = "right"
): Briefing {
  const slice =
    filter.alley || filter.pattern
      ? filterSessionsBy(sessions, {
          alleyName: filter.alley || undefined,
          oilPattern: filter.pattern || undefined
        })
      : sessions;

  const sliceKeys = new Set(slice.map(sessionKey));
  const rest = sessions.filter((s) => !sliceKeys.has(sessionKey(s)));

  const sliceStats = calculateStats(slice, undefined, handedness);
  const restStats = calculateStats(rest, undefined, handedness);
  const games = sliceStats.completedGames;

  const found: BriefingFinding[] = [];
  const gathering: BriefingGap[] = [];

  if (games < MIN_SLICE_GAMES) {
    // Nothing is worth saying yet, and it is one shortfall rather than five:
    // listing every rule as blocked would be five ways of saying the same thing.
    return {
      sessions: slice.length,
      games,
      callouts: [],
      lastTime: lastTimeHere(slice, balls),
      gathering: [{ kind: "slice", have: games, need: MIN_SLICE_GAMES }]
    };
  }

  push(found, gathering, ballFinding(slice, balls, handedness));
  push(found, gathering, expectationFinding(sliceStats, restStats, games));
  push(found, gathering, gameSlotFinding(slice, handedness));
  push(found, gathering, spareFinding(sliceStats, restStats, games, restStats.completedGames));
  push(found, gathering, laneBiasFinding(slice, handedness));

  const callouts = found
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
    .slice(0, MAX_CALLOUTS);

  return {
    sessions: slice.length,
    games,
    callouts,
    lastTime: lastTimeHere(slice, balls),
    gathering
  };
}

/** A rule reports one of three things: a finding, what it is short of, or that
 *  it ran and found nothing worth saying. */
type RuleResult = BriefingFinding | BriefingGap | null;

function push(found: BriefingFinding[], gathering: BriefingGap[], result: RuleResult) {
  if (result === null) return;
  if ("have" in result) gathering.push(result);
  else found.push(result);
}

/** Sessions have ids in practice; the date and alley identify the rest. */
function sessionKey(s: SessionSummary): string {
  return s.session.id != null
    ? `id:${s.session.id}`
    : `${s.session.date}|${s.session.alley_name}|${s.session.description ?? ""}`;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** The ball that carried best here, against the next one down. Two balls with
 *  enough behind them, or there is no comparison to draw. */
function ballFinding(slice: SessionSummary[], balls: Ball[], handedness: Handedness): RuleResult {
  const report = calculateBallPerformance(slice, balls, undefined, handedness);
  const eligible = report.balls
    .filter((b) => b.firstBalls >= MIN_BALL_FIRST_BALLS && b.carryPct !== null)
    .sort((a, b) => (b.carryPct as number) - (a.carryPct as number));

  if (eligible.length < 2) {
    return { kind: "ball", have: eligible.length, need: 2, each: MIN_BALL_FIRST_BALLS };
  }

  const [top, next] = eligible;
  const delta = (top.carryPct as number) - (next.carryPct as number);
  if (delta < MIN_RATE_DELTA) return null;

  return {
    kind: "ball",
    name: top.name,
    carryPct: top.carryPct as number,
    firstBalls: top.firstBalls,
    runnerUp: next.name,
    runnerUpCarryPct: next.carryPct as number
  };
}

/** What you average here against everywhere else. */
function expectationFinding(
  sliceStats: ReturnType<typeof calculateStats>,
  restStats: ReturnType<typeof calculateStats>,
  games: number
): RuleResult {
  if (restStats.completedGames < MIN_BASELINE_GAMES) {
    return { kind: "expectation", have: restStats.completedGames, need: MIN_BASELINE_GAMES };
  }
  const average = sliceStats.averageScore;
  const baseline = restStats.averageScore;
  if (average === null || baseline === null) return null;

  const delta = average - baseline;
  if (Math.abs(delta) < MIN_PIN_DELTA) return null;
  return { kind: "expectation", average, baseline, delta, games };
}

/** Which game of the night treats you best here, and which worst. */
function gameSlotFinding(slice: SessionSummary[], handedness: Handedness): RuleResult {
  const slots = calculateGameNumberMetrics(slice, undefined, handedness).filter(
    (s) => s.games >= MIN_SLOT_GAMES && s.stats.averageScore !== null
  );
  if (slots.length < 2) {
    return { kind: "gameSlot", have: slots.length, need: 2, each: MIN_SLOT_GAMES };
  }

  const sorted = [...slots].sort(
    (a, b) => (b.stats.averageScore as number) - (a.stats.averageScore as number)
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const delta = (best.stats.averageScore as number) - (worst.stats.averageScore as number);
  if (delta < MIN_SLOT_DELTA) return null;

  return {
    kind: "gameSlot",
    bestGame: best.gameNumber,
    bestAverage: best.stats.averageScore as number,
    worstGame: worst.gameNumber,
    worstAverage: worst.stats.averageScore as number,
    games: slots.reduce((n, s) => n + s.games, 0)
  };
}

/** Spare conversion here against everywhere else. */
function spareFinding(
  sliceStats: ReturnType<typeof calculateStats>,
  restStats: ReturnType<typeof calculateStats>,
  games: number,
  baselineGames: number
): RuleResult {
  if (baselineGames < MIN_BASELINE_GAMES) {
    return { kind: "spares", have: baselineGames, need: MIN_BASELINE_GAMES };
  }
  const sparePct = sliceStats.sparePct;
  const baseline = restStats.sparePct;
  if (sparePct === null || baseline === null) return null;

  const delta = sparePct - baseline;
  if (Math.abs(delta) < MIN_RATE_DELTA) return null;
  return { kind: "spares", sparePct, baseline, delta, games };
}

/** One lane of the pair against the other, where a pair is played often enough
 *  for the difference to be about the lanes. */
function laneBiasFinding(slice: SessionSummary[], handedness: Handedness): RuleResult {
  const gamesPerLane = new Map<string, number>();
  for (const s of slice) {
    for (const game of s.games) {
      for (const lane of gameLanes(game)) {
        gamesPerLane.set(lane, (gamesPerLane.get(lane) ?? 0) + 1);
      }
    }
  }

  const eligible = [...gamesPerLane.entries()].filter(([, n]) => n >= MIN_LANE_GAMES);
  if (eligible.length < 2) {
    return { kind: "laneBias", have: eligible.length, need: 2, each: MIN_LANE_GAMES };
  }

  const rated = eligible
    .map(([lane, games]) => ({
      lane,
      games,
      strikePct: calculateStats(slice, [lane], handedness).strikePct
    }))
    .filter((l) => l.strikePct !== null)
    .sort((a, b) => (b.strikePct as number) - (a.strikePct as number));

  if (rated.length < 2) return null;
  const top = rated[0];
  const bottom = rated[rated.length - 1];
  const delta = (top.strikePct as number) - (bottom.strikePct as number);
  if (delta < MIN_LANE_DELTA) return null;

  return {
    kind: "laneBias",
    lane: top.lane,
    strikePct: top.strikePct as number,
    otherLane: bottom.lane,
    otherStrikePct: bottom.strikePct as number,
    games: top.games + bottom.games
  };
}

// ---------------------------------------------------------------------------
// Last time here
// ---------------------------------------------------------------------------

/**
 * The line you played on your most recent night in the slice.
 *
 * Read from the fresh-rack balls that carry a line, grouped by ball, taking
 * whichever ball most of them were thrown with. Median rather than mean, so a
 * single stray shot does not become the line you remember playing.
 */
function lastTimeHere(slice: SessionSummary[], balls: Ball[]): LastTimeHere | null {
  const latest = [...slice].sort((a, b) => b.session.date.localeCompare(a.session.date))[0];
  if (!latest) return null;

  const scores = latest.games.flatMap((g) =>
    typeof g.final_score === "number" ? [g.final_score] : []
  );

  const byBall = new Map<number | undefined, { stances: number[]; targets: number[] }>();
  for (const game of latest.games) {
    for (const frame of (game as Game & { frames: Frame[] }).frames ?? []) {
      for (const index of freshRackShotIndices(frame.shots)) {
        const shot = frame.shots[index];
        const line = shot.intended ?? shot.actual;
        if (!line) continue;
        if (line.stance === undefined && line.target === undefined) continue;
        const entry = byBall.get(shot.ball_id) ?? { stances: [], targets: [] };
        if (line.stance !== undefined) entry.stances.push(line.stance);
        if (line.target !== undefined) entry.targets.push(line.target);
        byBall.set(shot.ball_id, entry);
      }
    }
  }

  const busiest = [...byBall.entries()].sort(
    (a, b) =>
      b[1].stances.length + b[1].targets.length - (a[1].stances.length + a[1].targets.length)
  )[0];

  const base: LastTimeHere = {
    sessionId: latest.session.id,
    date: latest.session.date,
    alley: latest.session.alley_name,
    games: scores.length,
    average: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null
  };

  if (!busiest) return base;
  return {
    ...base,
    ballName: balls.find((b) => b.id === busiest[0])?.name,
    stance: median(busiest[1].stances),
    target: median(busiest[1].targets)
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 2) / 2;
}

function gameLanes(game: Game): string[] {
  return game.lanes ?? (game.lane_number ? [game.lane_number] : []);
}
