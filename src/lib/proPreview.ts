import type { BallEstimate } from "./scoreModel";
import type { BallPerformance, LeaveStats } from "./stats";
import type { PinNumber } from "../types/bowling";

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

/**
 * The leaves open without Pro (ADR-192): the 7 and the 10, the corner pins,
 * which are the leaves every bowler of either hand leaves most. The same two
 * for every bowler, under every filter, so no filter and no session's sheet
 * opens a different leave's record, as ranking within each one did.
 */
export const FREE_LEAVE_PINS: readonly (readonly PinNumber[])[] = [[7], [10]];

const FREE_KEYS = new Set(FREE_LEAVE_PINS.map(keyOf));

/** A leave never left: on the card all the same, at nothing. */
function neverLeft(pins: readonly PinNumber[]): LeaveStats {
  return { pins: [...pins], attempts: 0, chances: 0, conversions: 0, conversionPct: null, sharePct: null };
}

/**
 * The leaves card without Pro: the 7 and the 10 in full, whether or not they
 * have been left, then the leave left most of the rest, blurred.
 */
export function freeLeavePreview(leaves: readonly LeaveStats[]): { shown: LeaveStats[]; blurred: LeaveStats | undefined } {
  const shown = FREE_LEAVE_PINS.map(
    (pins) => leaves.find((l) => keyOf(l.pins) === keyOf(pins)) ?? neverLeft(pins)
  );
  const blurred = leaves.filter((l) => l.chances > 0 && !FREE_KEYS.has(keyOf(l.pins))).sort(byMostLeft)[0];
  return { shown, blurred };
}

/** Whether a leave's record is open without Pro: on Stats, on the Spare lines
 *  page and in its sheet alike. */
export function isOpenLeave(pins: readonly number[]): boolean {
  return FREE_KEYS.has(keyOf(pins));
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
