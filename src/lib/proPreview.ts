import type { BallEstimate } from "./scoreModel";
import type { BallPerformance, LeaveStats } from "./stats";

/**
 * How much of a Pro list a bowler without Pro reads (ADR-167): the first few
 * rows as they are, the next one blurred under a small Pro mark, and nothing
 * after it. A real number of their own says what the list is for; the blurred
 * row says there is more.
 */

/** Balls on Stats and on the Alley report. */
export const FREE_BALLS = 1;

/** A list split for a locked screen: the rows shown in full, then the one
 *  shown blurred. Always one row short of the whole list, so a list of one is
 *  the blurred row alone and there is never a locked list with nothing locked. */
export function previewSplit<T>(items: readonly T[], free: number): { shown: T[]; blurred: T | undefined } {
  const n = Math.min(free, Math.max(items.length - 1, 0));
  return { shown: items.slice(0, n), blurred: items[n] };
}

/** The order Stats lists leaves in: left most, then the most chances. */
export function byMostLeft(a: LeaveStats, b: LeaveStats): number {
  return b.attempts - a.attempts || b.chances - a.chances;
}

const keyOf = (pins: readonly number[]) => pins.join("-");

/** Leaves on Stats without Pro, and so their record wherever else it shows. */
export const FREE_LEAVES = 2;

/**
 * The leaves card without Pro (ADR-195): the two left most, in full, then the
 * next one blurred. Ranked within whatever the screen shows, so a filter shows
 * that filter's top two; a bowler still never reads the whole list.
 */
export function freeLeavePreview(leaves: readonly LeaveStats[]): { shown: LeaveStats[]; blurred: LeaveStats | undefined } {
  return previewSplit(
    leaves.filter((l) => l.chances > 0).sort(byMostLeft),
    FREE_LEAVES
  );
}

/** The leaves whose record is open without Pro: the ones Stats shows in full,
 *  by the same ranking over the same leaves. */
export function openLeaveKeys(leaves: readonly LeaveStats[]): Set<string> {
  return new Set(freeLeavePreview(leaves).shown.map((l) => keyOf(l.pins)));
}

/** Whether a leave's record is open without Pro: on Stats, on the Spare lines
 *  page and in its sheet alike, exactly when its cell on Stats is. */
export function isOpenLeave(leaves: readonly LeaveStats[], pins: readonly number[]): boolean {
  return openLeaveKeys(leaves).has(keyOf(pins));
}

/*
 * Stand-ins for the blurred row (ADR-190). Blurred text is still in the page,
 * and a browser's tools read it, so the row under the blur keeps its look (the
 * leave's pins, the ball's name and photo) and none of its record. The numbers
 * are plausible and fixed, so the blur reads as a row and gives nothing away.
 */

export function standInLeave(leave: LeaveStats): LeaveStats {
  return { ...leave, attempts: 8, chances: 8, conversions: 5, conversionPct: 63, sharePct: 4 };
}

export function standInBall(ball: BallPerformance): BallPerformance {
  return {
    ...ball,
    firstBalls: 40,
    pocketPct: 60,
    carryPct: 70,
    strikePct: 42,
    firstBallAverage: 8.6,
    strikeOnStrikePct: 40,
    byGame: [],
    leaves: []
  };
}

export function standInEstimate(estimate: BallEstimate): BallEstimate {
  return {
    ...estimate,
    modelled: 190,
    difference: 3,
    fromStrikes: 2,
    fromLeaves: 1,
    estimate: estimate.estimate === null ? null : 190,
    firstBalls: 40,
    thin: false,
    counted: {
      firstBalls: 40,
      strikes: 17,
      afterStrike: 10,
      strikesAfterStrike: 4,
      leaves: 23,
      splits: 2,
      pickupChances: 23,
      pickups: 16
    },
    costliest: [],
    thinLeaveShare: 0,
    leaveMakeRate: 0.7,
    strikeAfterStrike: 0.4,
    strikeOtherwise: 0.42
  };
}
