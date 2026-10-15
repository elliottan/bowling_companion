import { isBabySplit, isSplit, isWashout } from "./pins";
import { freshRackShotIndices, laneForFrame } from "./lanes";
import type { Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

/**
 * An estimated game score, from the parts a score is made of (ADR-147).
 *
 * A ball's average is hard to read off its games: most games are thrown with
 * more than one ball, and a ball with fifty balls behind it has no games of its
 * own. What a strike ball does decide is how often it strikes, how often it
 * strikes again straight after a strike, and which pins it leaves when it does
 * not. The spare is mostly the spare ball's, so a leave is scored at the
 * bowler's own make rate on that exact leave, from every ball they have shot at
 * it. A ball that leaves more splits then costs what those splits cost this
 * bowler, which its first ball average alone hides.
 *
 * The game is played out exactly, not simulated: every frame carries the
 * chance of each state (did the last fresh-rack ball strike, and what bonus is
 * still owed on the next two balls) and the score expected so far.
 */

const PINS = 10;

/** One leave as the model plays it. */
export interface ModelLeave {
  /** Pins standing after the first ball. */
  standing: number;
  /** Chance of this leave, given the first ball did not strike. Sums to 1. */
  weight: number;
  /** Chance the spare is made. */
  makeRate: number;
  /** Pins knocked down by a spare ball that misses. */
  pinsOnMiss: number;
}

export interface FrameModel {
  /** Chance a fresh-rack ball strikes straight after a strike. */
  strikeAfterStrike: number;
  /** Chance it strikes after anything else: a game's first ball, or a frame
   *  that was not a strike. */
  strikeOtherwise: number;
  leaves: ModelLeave[];
}

/** Bonus owed: the multiplier still due on the next ball and the one after. */
type StateKey = string;
interface State {
  afterStrike: boolean;
  next: number;
  then: number;
  /** Chance of being in this state. */
  p: number;
  /** Expected score so far, times `p`. */
  mass: number;
}

function key(afterStrike: boolean, next: number, then: number): StateKey {
  return `${afterStrike ? 1 : 0}${next}${then}`;
}

function add(into: Map<StateKey, State>, afterStrike: boolean, next: number, then: number, p: number, mass: number) {
  if (p === 0) return;
  const k = key(afterStrike, next, then);
  const s = into.get(k);
  if (s) {
    s.p += p;
    s.mass += mass;
  } else {
    into.set(k, { afterStrike, next, then, p, mass });
  }
}

/** The score a game is expected to come to, played out frame by frame. */
export function expectedGameScore(model: FrameModel): number {
  const strike = (afterStrike: boolean) =>
    afterStrike ? model.strikeAfterStrike : model.strikeOtherwise;
  // Pins a fresh-rack ball is expected to knock down, for the 10th's last ball.
  const firstBallPins = (afterStrike: boolean) => {
    const ps = strike(afterStrike);
    return ps * PINS + (1 - ps) * model.leaves.reduce((t, l) => t + l.weight * (PINS - l.standing), 0);
  };

  let states = new Map<StateKey, State>();
  add(states, false, 0, 0, 1, 0);

  for (let frame = 1; frame <= 9; frame++) {
    const out = new Map<StateKey, State>();
    for (const s of states.values()) {
      const ps = strike(s.afterStrike);
      // A strike: ten, paid out again on whatever bonus is owed, and owing
      // the next two balls.
      add(out, true, s.then + 1, 1, s.p * ps, s.mass * ps + s.p * ps * PINS * (1 + s.next));
      for (const leave of model.leaves) {
        const q = (1 - ps) * leave.weight;
        const first = (PINS - leave.standing) * (1 + s.next);
        const made = q * leave.makeRate;
        const missed = q - made;
        add(out, false, 1, 0, s.p * made, s.mass * made + s.p * made * (first + leave.standing * (1 + s.then)));
        add(out, false, 0, 0, s.p * missed, s.mass * missed + s.p * missed * (first + leave.pinsOnMiss * (1 + s.then)));
      }
    }
    states = out;
  }

  // The 10th: up to three balls, no bonus of its own, the first two still
  // paying what earlier frames owe.
  let total = 0;
  for (const s of states.values()) {
    total += s.mass + s.p * tenthFrame(model, s, strike, firstBallPins);
  }
  return total;
}

function tenthFrame(
  model: FrameModel,
  s: State,
  strike: (afterStrike: boolean) => number,
  firstBallPins: (afterStrike: boolean) => number
): number {
  const p1 = strike(s.afterStrike);
  const p2 = strike(true);
  // Ball 1 strikes, then ball 2 at a fresh rack.
  let afterStrike = PINS * (1 + s.next);
  afterStrike += p2 * (PINS * (1 + s.then) + firstBallPins(true));
  for (const l of model.leaves) {
    const spare = l.makeRate * l.standing + (1 - l.makeRate) * l.pinsOnMiss;
    afterStrike += (1 - p2) * l.weight * ((PINS - l.standing) * (1 + s.then) + spare);
  }
  // Ball 1 leaves pins: the spare, and a fresh rack if it is made.
  let afterLeave = 0;
  for (const l of model.leaves) {
    const made = l.makeRate * (l.standing * (1 + s.then) + firstBallPins(false));
    const missed = (1 - l.makeRate) * l.pinsOnMiss * (1 + s.then);
    afterLeave += l.weight * ((PINS - l.standing) * (1 + s.next) + made + missed);
  }
  return p1 * afterStrike + (1 - p1) * afterLeave;
}

// ---------------------------------------------------------------------------
// Reading the model's inputs off the bowler's games
// ---------------------------------------------------------------------------

/** How a leave is shot, for a leave seen too rarely to have a rate of its own. */
export type LeaveKind = "single" | "makeable" | "split";

export function leaveKind(standing: PinNumber[]): LeaveKind {
  if (standing.length === 1) return "single";
  if (isWashout(standing) || (isSplit(standing) && !isBabySplit(standing))) return "split";
  return "makeable";
}

/** Fewer chances at a leave than this and its make rate leans on its kind's,
 *  and the leave is flagged as thin. */
export const THIN_LEAVE_CHANCES = 5;

/** A kind with no chances at all: what a league bowler makes, near enough. */
const KIND_FALLBACK: Record<LeaveKind, number> = { single: 0.85, makeable: 0.6, split: 0.1 };

interface Tally {
  chances: number;
  made: number;
  /** Pins knocked down on the misses, summed. */
  missPins: number;
}

const emptyTally = (): Tally => ({ chances: 0, made: 0, missPins: 0 });

/** One leave's make rate, as the model will use it. */
export interface LeaveRate {
  pins: PinNumber[];
  kind: LeaveKind;
  chances: number;
  made: number;
  makeRate: number;
  pinsOnMiss: number;
  /** Too few chances for a rate of its own: it leans on its kind's. */
  thin: boolean;
}

/**
 * The bowler's spare shooting, every leave on its own (ADR-147). Read across
 * every ball, since the spare is mostly the spare ball's whichever ball left
 * it. A leave with few chances leans on its kind's rate in proportion: one
 * chance is mostly the kind, twenty are all the leave.
 */
export class SpareBook {
  private readonly byLeave = new Map<string, { pins: PinNumber[]; tally: Tally }>();
  private readonly byKind: Record<LeaveKind, Tally> = {
    single: emptyTally(),
    makeable: emptyTally(),
    split: emptyTally()
  };

  record(leave: PinNumber[], made: boolean, missPins: number): void {
    const pins = [...leave].sort((a, b) => a - b) as PinNumber[];
    const k = pins.join("-");
    const entry = this.byLeave.get(k) ?? { pins, tally: emptyTally() };
    this.byLeave.set(k, entry);
    for (const t of [entry.tally, this.byKind[leaveKind(pins)]]) {
      t.chances++;
      if (made) t.made++;
      else t.missPins += missPins;
    }
  }

  rate(leave: PinNumber[]): LeaveRate {
    const pins = [...leave].sort((a, b) => a - b) as PinNumber[];
    const kind = leaveKind(pins);
    const own = this.byLeave.get(pins.join("-"))?.tally ?? emptyTally();
    const kindTally = this.byKind[kind];
    const kindRate = shrink(kindTally.made, kindTally.chances, KIND_FALLBACK[kind], THIN_LEAVE_CHANCES);
    const kindMiss = kindTally.chances > kindTally.made
      ? kindTally.missPins / (kindTally.chances - kindTally.made)
      : Math.max(0, pins.length - 1);
    const misses = own.chances - own.made;
    return {
      pins,
      kind,
      chances: own.chances,
      made: own.made,
      makeRate: shrink(own.made, own.chances, kindRate, THIN_LEAVE_CHANCES),
      // A miss knocks down a share of the leave like its kind's misses do.
      pinsOnMiss: Math.min(
        pins.length - 1,
        misses > 0 ? (own.missPins + kindMiss) / (misses + 1) : kindMiss
      ),
      thin: own.chances < THIN_LEAVE_CHANCES
    };
  }
}

/** `made` of `n` pulled toward `prior` by `k` imagined tries at it. */
export function shrink(made: number, n: number, prior: number, k: number): number {
  return (made + k * prior) / (n + k);
}

/** What one ball (or all of them) did at a full rack, counted. */
export interface StrikeProfile {
  afterStrike: { balls: number; strikes: number };
  otherwise: { balls: number; strikes: number };
  /** Leaves off its fresh-rack balls, keyed "2-4-5". */
  leaves: Map<string, { pins: PinNumber[]; count: number }>;
}

export function emptyProfile(): StrikeProfile {
  return { afterStrike: { balls: 0, strikes: 0 }, otherwise: { balls: 0, strikes: 0 }, leaves: new Map() };
}

export interface ReadOptions {
  /** Only frames on these lanes, as the Stats filters read them. */
  lanes?: string[];
}

type GameWithFrames = Game & { frames: Frame[] };

/**
 * Reads the games once: the spare book across every ball, and a strike
 * profile per ball (keyed by ball id) plus one for every ball together under
 * `all`. A fresh-rack ball's state is the fresh-rack ball before it in the
 * same game, whoever threw it, since that is what the lane and the bowler's
 * rhythm carry over (ADR-124).
 */
export function readGames(
  sessions: SessionSummary[],
  options: ReadOptions = {}
): { spares: SpareBook; all: StrikeProfile; byBall: Map<number, StrikeProfile>; games: number[] } {
  const lanes = options.lanes?.length ? new Set(options.lanes) : undefined;
  const spares = new SpareBook();
  const all = emptyProfile();
  const byBall = new Map<number, StrikeProfile>();
  const games: number[] = [];

  for (const s of sessions) {
    for (const game of s.games as GameWithFrames[]) {
      const onLane = (frameNumber: number) => {
        if (!lanes) return true;
        const lane = laneForFrame(game, frameNumber);
        return lane != null && lanes.has(String(lane));
      };
      if (typeof game.final_score === "number" && game.frames.some((f) => onLane(f.frame_number))) {
        games.push(game.final_score);
      }
      let lastStruck = false;
      for (const frame of [...game.frames].sort((a, b) => a.frame_number - b.frame_number)) {
        const counted = onLane(frame.frame_number);
        for (const i of freshRackShotIndices(frame.shots)) {
          const shot = frame.shots[i];
          const next: Shot | undefined = frame.shots[i + 1];
          if (counted) {
            for (const profile of profilesFor(shot, all, byBall)) tallyBall(profile, shot, lastStruck);
            if (shot.pins_standing.length > 0 && next) {
              const made = next.pins_standing.length === 0;
              spares.record(shot.pins_standing, made, shot.pins_standing.length - next.pins_standing.length);
            }
          }
          lastStruck = shot.pins_standing.length === 0;
        }
      }
    }
  }
  return { spares, all, byBall, games };
}

function profilesFor(shot: Shot, all: StrikeProfile, byBall: Map<number, StrikeProfile>): StrikeProfile[] {
  if (shot.ball_id == null) return [all];
  const own = byBall.get(shot.ball_id) ?? emptyProfile();
  byBall.set(shot.ball_id, own);
  return [all, own];
}

function tallyBall(profile: StrikeProfile, shot: Shot, afterStrike: boolean): void {
  const bucket = afterStrike ? profile.afterStrike : profile.otherwise;
  bucket.balls++;
  if (shot.pins_standing.length === 0) {
    bucket.strikes++;
    return;
  }
  const pins = [...shot.pins_standing].sort((a, b) => a - b) as PinNumber[];
  const k = pins.join("-");
  const entry = profile.leaves.get(k) ?? { pins, count: 0 };
  entry.count++;
  profile.leaves.set(k, entry);
}

/** Pseudo-balls a ball's strike rates borrow from the bowler's in the same
 *  scope: under about this many, the ball reads mostly as the bowler. */
export const BALL_PRIOR_BALLS = 20;

export interface ModelInputs {
  model: FrameModel;
  /** Share of this ball's leaves, by how often they come up, whose make rate
   *  rests on too few chances to stand on its own. */
  thinLeaveShare: number;
  /** Expected make rate across the leaves it gives you, every leave counted. */
  leaveMakeRate: number;
}

/**
 * The model for one profile. Given a `parent` (the bowler across every ball,
 * in the same scope), its strike rates and leave mix lean on the parent's in
 * proportion to how little is behind them, so a thin ball reads close to the
 * bowler rather than to its last few throws.
 */
export function buildModel(
  profile: StrikeProfile,
  spares: SpareBook,
  parent?: StrikeProfile,
  priorBalls = BALL_PRIOR_BALLS
): ModelInputs {
  const parentRates = parent ? buildModel(parent, spares) : undefined;
  const k = parent ? priorBalls : 0;
  const strikeOtherwise = shrink(
    profile.otherwise.strikes,
    profile.otherwise.balls,
    parentRates?.model.strikeOtherwise ?? 0,
    profile.otherwise.balls + k === 0 ? 1 : k
  );
  const strikeAfterStrike = shrink(
    profile.afterStrike.strikes,
    profile.afterStrike.balls,
    parentRates?.model.strikeAfterStrike ?? strikeOtherwise,
    // Too few strikes to follow: lean on this ball's own other rate.
    parent ? k : profile.afterStrike.balls === 0 ? 1 : 0
  );

  // The leave mix, leaning on the parent's the same way.
  const counts = new Map<string, { pins: PinNumber[]; weight: number }>();
  let own = 0;
  for (const [k2, l] of profile.leaves) {
    counts.set(k2, { pins: l.pins, weight: l.count });
    own += l.count;
  }
  if (parent && k > 0) {
    let parentTotal = 0;
    for (const l of parent.leaves.values()) parentTotal += l.count;
    for (const [k2, l] of parent.leaves) {
      const entry = counts.get(k2) ?? { pins: l.pins, weight: 0 };
      entry.weight += (k * l.count) / Math.max(1, parentTotal);
      counts.set(k2, entry);
    }
    own += parentTotal > 0 ? k : 0;
  }

  const leaves: ModelLeave[] = [];
  let thin = 0;
  let makeRate = 0;
  for (const { pins, weight } of counts.values()) {
    const w = own > 0 ? weight / own : 0;
    const r = spares.rate(pins);
    leaves.push({ standing: pins.length, weight: w, makeRate: r.makeRate, pinsOnMiss: r.pinsOnMiss });
    if (r.thin) thin += w;
    makeRate += w * r.makeRate;
  }
  return {
    model: { strikeAfterStrike, strikeOtherwise, leaves },
    thinLeaveShare: thin,
    leaveMakeRate: makeRate
  };
}

export interface BallEstimate {
  ballId: number;
  /** The model's game for this ball, in pins. */
  modelled: number;
  /** Pins a game this ball is worth against the bowler's own model, every
   *  ball together. The model's absolute number is never shown (ADR-147). */
  difference: number;
  /** The bowler's real average in scope, moved by `difference`. */
  estimate: number | null;
  firstBalls: number;
  thinLeaveShare: number;
  leaveMakeRate: number;
  strikeAfterStrike: number;
  strikeOtherwise: number;
}

/** Every ball's estimated average in one scope, against the bowler's real one. */
export function estimateBalls(sessions: SessionSummary[], options: ReadOptions = {}) {
  const { spares, all, byBall, games } = readGames(sessions, options);
  const overall = buildModel(all, spares);
  const baseline = expectedGameScore(overall.model);
  const actual = games.length ? games.reduce((a, b) => a + b, 0) / games.length : null;
  const balls: BallEstimate[] = [...byBall.entries()].map(([ballId, profile]) => {
    const inputs = buildModel(profile, spares, all);
    const modelled = expectedGameScore(inputs.model);
    const difference = modelled - baseline;
    return {
      ballId,
      modelled,
      difference,
      estimate: actual === null ? null : actual + difference,
      firstBalls: profile.afterStrike.balls + profile.otherwise.balls,
      thinLeaveShare: inputs.thinLeaveShare,
      leaveMakeRate: inputs.leaveMakeRate,
      strikeAfterStrike: inputs.model.strikeAfterStrike,
      strikeOtherwise: inputs.model.strikeOtherwise
    };
  });
  return { baseline, actual, games: games.length, balls, overall };
}
