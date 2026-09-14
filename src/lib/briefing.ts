import { freshRackShotIndices } from "./lanes";
import type { BallGameCell } from "./stats";
import {
  calculateBallPerformance,
  calculateGameNumberMetrics,
  calculateStats,
  filterSessionsBy
} from "./stats";
import type { Ball, Frame, Game, Handedness, SessionSummary } from "../types/bowling";

/**
 * What your own history says about somewhere you are about to bowl (ADR-064b).
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

/** A game slot needs this many games here before its line is worth reading
 *  back. Lower than `MIN_SLOT_GAMES`, deliberately: that floor guards an
 *  average score, which is noisy, while this one guards a median stance and
 *  target, which is a description of what you did rather than a comparison
 *  against anything. Two sessions is enough to say where you opened and where
 *  you finished; one session is what "Last time" already shows. */
const MIN_MOVEMENT_SLOT_GAMES = 2;
/** Slots needed before there is a movement to read. One slot is a line, not a
 *  move. */
const MIN_MOVEMENT_SLOTS = 2;

/** A ball needs this many fresh-rack balls in the slice before it can be
 *  compared to another one. Matches the ball table's own floor. */
const MIN_BALL_FIRST_BALLS = 20;
/** A ball needs this many fresh-rack balls inside a scope before it is listed
 *  there at all. Lower than `MIN_BALL_FIRST_BALLS`, because a scope is one or
 *  two games of every session rather than all of them, and a floor the slice
 *  can never clear reports nothing forever. Two games is roughly twenty
 *  fresh-rack balls, so this is about a session and a half in that scope. */
const MIN_SCOPE_FIRST_BALLS = 12;
/** Below this a read is marked thin rather than dropped. It applies to the lane
 *  column, which is half the games of the house column by construction: hiding
 *  every thin lane read would empty the column that the lane picker was chosen
 *  for, and the honest answer is to show it and say it is thin. */
const MIN_LANE_FIRST_BALLS = 8;
/** Balls listed per scope. Past the fifth it is a list of what you own. */
const MAX_SCOPE_BALLS = 5;

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
  /** One lane of the pair you are about to bowl. Narrows the lane read only:
   *  the house read beside it stays every lane at the alley and pattern. */
  lane?: string;
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

/**
 * The line played in one game: the ball most of its fresh-rack balls were
 * thrown with, and the median stance and target with that ball.
 *
 * One of these per game is what a night's movement is made of. Collapsing a
 * night into a single median hides the thing a bowler wants back, which is
 * where the line started and where it finished (ADR-082).
 */
export interface GameLine {
  gameNumber: number;
  score: number | null;
  ballName?: string;
  stance?: number;
  target?: number;
}

/**
 * Where the line sits in one game slot, across every session in the slice.
 *
 * Slot rather than session: game 1 here against game 3 here is the comparison
 * that says how far the lanes move on you at this alley. A slot needs enough
 * games behind it before its median is a pattern rather than one night.
 */
export interface MovementSlot extends GameLine {
  /** Games behind this slot's line. `score` is their average. */
  games: number;
}

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
  /** The same read, game by game, in the order they were bowled. Empty when
   *  none of that session's games carried a line. */
  perGame: GameLine[];
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
  /** `slice` is the whole screen being short, rather than one rule.
   *  `movement` is the game-by-game line, which is not a ranked finding. */
  kind: BriefingFinding["kind"] | "slice" | "movement" | "phase";
  have: number;
  need: number;
  /** Floor each of the `need` things has to clear, where there is one. */
  each?: number;
}

/**
 * The three reads of a lane: fresh, the middle of the session, and the end of
 * it. Game number is the only clock the app has, so that is what the windows
 * are cut on.
 *
 * They overlap on purpose. How fast a pattern breaks down depends on how many
 * bowlers are on the pair: game 2 on a squad of eight is already a long way
 * from fresh, while game 2 bowling alone is close to it. So game 2 counts as
 * both fresh and mid, and game 4 as both mid and late, and a ball that is
 * strong in one window and weak in the next says the transition happens around
 * there. A single hard cut would claim a precision the data does not have.
 */
export type PhaseKey = "fresh" | "mid" | "late";

export interface PhaseWindow {
  key: PhaseKey;
  fromGame: number;
  /** Inclusive. Absent on the last window, which runs to the end of the night. */
  toGame?: number;
}

export const PHASE_WINDOWS: PhaseWindow[] = [
  { key: "fresh", fromGame: 1, toGame: 2 },
  { key: "mid", fromGame: 2, toGame: 4 },
  { key: "late", fromGame: 4 }
];

/** One read of one ball: the rates, and how much is behind them.
 *
 *  The rates are the per-game cells of `calculateBallPerformance` added up
 *  over the games in scope, not a second calculation, so ADR-048 holds: one
 *  definition of pocket, carry and strike in the app. */
export interface BallRates {
  firstBalls: number;
  pocketPct: number | null;
  carryPct: number | null;
  strikePct: number | null;
  /** Too few balls behind these rates for them to lead a decision. Shown
   *  anyway, marked, rather than hidden: a thin read next to a fuller one is
   *  information, and a blank row is not. */
  thin: boolean;
}

/**
 * A ball inside one scope, read twice where a lane is chosen.
 *
 * `house` is every lane at the alley and pattern picked; `lane` is the lane
 * itself. Both, rather than one or the other, because they answer different
 * halves of the same question: the lane read is what happened on the lane you
 * are about to bowl, and the house read is whether that is the ball or the
 * night. A ball you have thrown twice on lane 7 falls back to the house read
 * on its own, without the whole screen falling back with it.
 */
export interface ScopeBall {
  ballId: number;
  name: string;
  house: BallRates;
  /** Null when no lane is chosen, or when this ball has never been thrown on
   *  it. */
  lane: BallRates | null;
}

/** What a scope covers: everything, one game of the night, or one window of
 *  it. The screen turns this into words (docs/DESIGN-LANGUAGE.md §8). */
export type ScopeSpan =
  | { kind: "all" }
  | { kind: "game"; gameNumber: number }
  | ({ kind: "phase" } & PhaseWindow);

export interface BallScope {
  /** Stable across renders, and what the chip row keys and remembers on. */
  key: string;
  span: ScopeSpan;
  /** Games in the slice that fell inside the scope. */
  games: number;
  /** Best strike rate first, capped. Scopes with nothing to report are not
   *  returned at all, so a chip never leads to an empty table. */
  balls: ScopeBall[];
}

export interface Briefing {
  sessions: number;
  games: number;
  /** Ranked and capped. Empty when nothing cleared the gates. */
  callouts: BriefingFinding[];
  lastTime: LastTimeHere | null;
  /** How the line moves across a session here, slot by slot, in game order.
   *  Empty until enough slots carry enough games. */
  movement: MovementSlot[];
  /** Which ball did what, across every game here and inside each game and
   *  window of a session. Widest first, then game by game, then the windows,
   *  and only the scopes with a ball to report. */
  scopes: BallScope[];
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

  // Read before the slice gate, not after. That gate guards comparisons
  // against the rest of your history, and the movement compares nothing: it
  // reads back the line you played here, which is worth having on a screen
  // that otherwise has nothing to say until six games are in.
  const movement = movementSlots(slice, balls);

  // Same reasoning: this describes what each ball did here, window by window,
  // rather than comparing the slice against anywhere else.
  const scopes = ballScopes(slice, balls, filter.lane, handedness);
  if (scopes.length === 0 && games >= MIN_SLICE_GAMES) {
    gathering.push({
      kind: "phase",
      have: bestScopeFirstBalls(slice, balls, handedness),
      need: MIN_SCOPE_FIRST_BALLS
    });
  }

  if (movement.length === 0 && games >= MIN_SLICE_GAMES) {
    // Only once the slice itself is worth reading. Below that the slice note
    // is the one shortfall, and a second line saying the same thing in game
    // slots is a second way of saying "keep bowling".
    gathering.push({
      kind: "movement",
      have: qualifyingMovementSlots(slice),
      need: MIN_MOVEMENT_SLOTS,
      each: MIN_MOVEMENT_SLOT_GAMES
    });
  }

  if (games < MIN_SLICE_GAMES) {
    // Nothing is worth saying yet, and it is one shortfall rather than five:
    // listing every rule as blocked would be five ways of saying the same thing.
    return {
      sessions: slice.length,
      games,
      callouts: [],
      lastTime: lastTimeHere(slice, balls),
      movement,
      scopes,
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
    movement,
    scopes,
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
// Which ball, when
// ---------------------------------------------------------------------------

function inWindow(gameNumber: number, window: PhaseWindow): boolean {
  return gameNumber >= window.fromGame && (window.toGame === undefined || gameNumber <= window.toGame);
}

/** Games in the scope, from the slice. */
function gamesInScope(slice: SessionSummary[], span: ScopeSpan): number {
  return slice.reduce((n, s) => n + s.games.filter((g) => inScope(g.game_number, span)).length, 0);
}

function inScope(gameNumber: number, span: ScopeSpan): boolean {
  if (span.kind === "all") return true;
  if (span.kind === "game") return gameNumber === span.gameNumber;
  return inWindow(gameNumber, span);
}

/** The scopes worth offering, given the games actually bowled here.
 *
 * Every game number bowled gets its own scope, because a game is the grain a
 * bowler already thinks in. The windows are offered only where they say
 * something a single game does not: a window covering one bowled game IS that
 * game, and two chips leading to the same table is a choice that is not one.
 */
function scopeSpans(slice: SessionSummary[]): ScopeSpan[] {
  const played = [
    ...new Set(slice.flatMap((s) => s.games.map((g) => g.game_number)))
  ].sort((a, b) => a - b);

  const windows = PHASE_WINDOWS.filter(
    (w) => played.filter((n) => inWindow(n, w)).length > 1
  );

  return [
    { kind: "all" },
    ...played.map<ScopeSpan>((gameNumber) => ({ kind: "game", gameNumber })),
    ...windows.map<ScopeSpan>((w) => ({ kind: "phase", ...w }))
  ];
}

/** Rates for one ball over the cells in scope, or null where it threw nothing. */
function ratesFor(cells: BallGameCell[], floor: number): BallRates | null {
  const firstBalls = sum(cells.map((c) => c.firstBalls));
  if (firstBalls === 0) return null;
  const pocket = sum(cells.map((c) => c.pocket));
  return {
    firstBalls,
    pocketPct: percent(pocket, firstBalls),
    carryPct: percent(sum(cells.map((c) => c.pocketStrikes)), pocket),
    strikePct: percent(sum(cells.map((c) => c.strikes)), firstBalls),
    thin: firstBalls < floor
  };
}

/**
 * Each ball's pocket, carry and strike rates in each scope, read at the house
 * and, where a lane is chosen, on that lane beside it.
 *
 * Built from the per-game cells of `calculateBallPerformance` rather than from
 * the frames again, so a scope is literally the ball table's own columns added
 * up: one definition of each rate (ADR-048), and a number here can always be
 * reconciled with the row it came from.
 *
 * Both reads are kept, rather than the lane replacing the house or a thin lane
 * falling back to it wholesale. They answer different halves of one question:
 * the lane read is what happened where you are about to bowl, and the house
 * read is whether that was the ball or the night. Falling back per ball rather
 * than per screen matters because the fallback is never uniform: the ball you
 * throw every game has a real lane read while the one you pull out twice a
 * season does not, and the two sit in the same table.
 *
 * This describes what happened, and nothing more. Ball choice is not random:
 * the ball you only pull out when the lanes have gone will carry worse late
 * for reasons that are nothing to do with the ball, and a ball that never
 * comes out of the bag until game 4 cannot look good on the fresh.
 */
function ballScopes(
  slice: SessionSummary[],
  balls: Ball[],
  lane: string | undefined,
  handedness: Handedness
): BallScope[] {
  const house = calculateBallPerformance(slice, balls, undefined, handedness);
  const onLane = lane ? calculateBallPerformance(slice, balls, [lane], handedness) : null;
  const laneById = new Map((onLane?.balls ?? []).map((b) => [b.ballId, b]));

  return scopeSpans(slice).flatMap<BallScope>((span) => {
    const rated = house.balls.flatMap<ScopeBall>((ball) => {
      const houseRates = ratesFor(
        ball.byGame.filter((c) => inScope(c.gameNumber, span)),
        MIN_SCOPE_FIRST_BALLS
      );
      if (houseRates === null || houseRates.firstBalls < MIN_SCOPE_FIRST_BALLS) return [];

      const laneCells = (laneById.get(ball.ballId)?.byGame ?? []).filter((c) =>
        inScope(c.gameNumber, span)
      );
      return [
        {
          ballId: ball.ballId,
          name: ball.name,
          house: houseRates,
          lane: onLane ? ratesFor(laneCells, MIN_LANE_FIRST_BALLS) : null
        }
      ];
    });

    if (rated.length === 0) return [];

    // Strike rate leads the order: it is the one rate that counts everything
    // the ball did with a full rack in front of it. The lane read sets the
    // order where it is solid enough to, because that is the lane being
    // bowled; a thin one does not, or two balls thrown on it would outrank a
    // season of evidence. Ties fall to the ball with more behind it rather
    // than to whichever was tagged first.
    const ranking = (b: ScopeBall): BallRates =>
      b.lane && !b.lane.thin ? b.lane : b.house;
    const sorted = rated
      .sort(
        (a, b) =>
          (ranking(b).strikePct ?? -1) - (ranking(a).strikePct ?? -1) ||
          b.house.firstBalls - a.house.firstBalls
      )
      .slice(0, MAX_SCOPE_BALLS);

    return [{ key: scopeKey(span), span, games: gamesInScope(slice, span), balls: sorted }];
  });
}

/** Stable per span, and stable across renders: the chip row keys on it. */
export function scopeKey(span: ScopeSpan): string {
  if (span.kind === "all") return "all";
  if (span.kind === "game") return `game-${span.gameNumber}`;
  return `phase-${span.key}`;
}

/** Fresh-rack balls behind the best-supported ball in any scope, so the "still
 *  gathering" note counts down the thing that is actually short. */
function bestScopeFirstBalls(
  slice: SessionSummary[],
  balls: Ball[],
  handedness: Handedness
): number {
  const report = calculateBallPerformance(slice, balls, undefined, handedness);
  const totals = scopeSpans(slice).flatMap((span) =>
    report.balls.map((ball) =>
      sum(ball.byGame.filter((c) => inScope(c.gameNumber, span)).map((c) => c.firstBalls))
    )
  );
  return totals.length === 0 ? 0 : Math.max(...totals);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function percent(made: number, opportunities: number): number | null {
  if (opportunities === 0) return null;
  return Math.round((made / opportunities) * 100);
}

// ---------------------------------------------------------------------------
// The line you played
// ---------------------------------------------------------------------------

/** Fresh-rack lines in these games, grouped by the ball that threw them. */
type LinesByBall = Map<number | undefined, { stances: number[]; targets: number[] }>;

/** A ball and a line, or nothing when no shot in the group carried one. */
interface BallLine {
  ballName?: string;
  stance?: number;
  target?: number;
}

function collectLines(games: Game[]): LinesByBall {
  const byBall: LinesByBall = new Map();
  for (const game of games) {
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
  return byBall;
}

/**
 * The ball most of these lines were thrown with, and the median line with it.
 *
 * Median rather than mean, so a single stray shot does not become the line you
 * remember playing. Medians are taken within the busiest ball rather than
 * across every ball, because averaging a line thrown with two different balls
 * describes a shot nobody threw.
 */
function busiestLine(byBall: LinesByBall, balls: Ball[]): BallLine | null {
  const busiest = [...byBall.entries()].sort(
    (a, b) =>
      b[1].stances.length + b[1].targets.length - (a[1].stances.length + a[1].targets.length)
  )[0];
  if (!busiest) return null;
  return {
    ballName: balls.find((b) => b.id === busiest[0])?.name,
    stance: median(busiest[1].stances),
    target: median(busiest[1].targets)
  };
}

/**
 * The line you played on your most recent session in the slice, whole and then
 * game by game.
 *
 * The whole-session read stays because it is the one line that fits in a
 * sentence. The per-game read is the one that answers what you opened with and
 * where you had moved to by the last game, which the session median averages
 * away (ADR-082).
 */
function lastTimeHere(slice: SessionSummary[], balls: Ball[]): LastTimeHere | null {
  const latest = [...slice].sort((a, b) => b.session.date.localeCompare(a.session.date))[0];
  if (!latest) return null;

  const scores = latest.games.flatMap((g) =>
    typeof g.final_score === "number" ? [g.final_score] : []
  );

  const ordered = [...latest.games].sort((a, b) => a.game_number - b.game_number);
  const perGame = ordered.flatMap<GameLine>((game) => {
    const line = busiestLine(collectLines([game]), balls);
    if (!line) return [];
    return [
      {
        gameNumber: game.game_number,
        score: typeof game.final_score === "number" ? game.final_score : null,
        ...line
      }
    ];
  });

  const base: LastTimeHere = {
    sessionId: latest.session.id,
    date: latest.session.date,
    alley: latest.session.alley_name,
    games: scores.length,
    average: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    perGame
  };

  const whole = busiestLine(collectLines(latest.games), balls);
  if (!whole) return base;
  return { ...base, ...whole };
}

// ---------------------------------------------------------------------------
// How the session moves here
// ---------------------------------------------------------------------------

/** Games in the slice, keyed by the slot they were bowled in. */
function gamesBySlot(slice: SessionSummary[]): Map<number, Game[]> {
  const slots = new Map<number, Game[]>();
  for (const s of slice) {
    for (const game of s.games) {
      const inSlot = slots.get(game.game_number) ?? [];
      inSlot.push(game);
      slots.set(game.game_number, inSlot);
    }
  }
  return slots;
}

/** Slots with enough games behind them, whether or not they carry a line. The
 *  number the "still gathering" note counts down. */
function qualifyingMovementSlots(slice: SessionSummary[]): number {
  return [...gamesBySlot(slice).values()].filter((g) => g.length >= MIN_MOVEMENT_SLOT_GAMES)
    .length;
}

/**
 * Where the line sits in each game slot here, in game order.
 *
 * Empty unless at least two slots clear the floor: one slot is where you play,
 * not how the lanes move. A slot that clears the floor but carries no line at
 * all is dropped rather than shown blank, and dropping it can take the reading
 * back below two, which is the honest outcome.
 */
function movementSlots(slice: SessionSummary[], balls: Ball[]): MovementSlot[] {
  const slots = [...gamesBySlot(slice).entries()]
    .filter(([, games]) => games.length >= MIN_MOVEMENT_SLOT_GAMES)
    .sort((a, b) => a[0] - b[0]);

  const read = slots.flatMap<MovementSlot>(([gameNumber, games]) => {
    const line = busiestLine(collectLines(games), balls);
    if (!line) return [];
    const scores = games.flatMap((g) => (typeof g.final_score === "number" ? [g.final_score] : []));
    return [
      {
        gameNumber,
        games: games.length,
        score: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        ...line
      }
    ];
  });

  return read.length >= MIN_MOVEMENT_SLOTS ? read : [];
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
