import type { LeaveStats } from "./stats";

/**
 * How much of a Pro list a bowler without Pro reads (ADR-167): the first few
 * rows as they are, the next one blurred under a small Pro mark, and nothing
 * after it. A real number of their own says what the list is for; the blurred
 * row says there is more.
 */

/** Leaves on Stats, and so their record wherever else it shows. */
export const FREE_LEAVES = 2;
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
 * The leaves whose record is open without Pro: the ones Stats shows in full,
 * by the same ranking over the same leaves. A leave's record on the Spare lines
 * page or in its sheet is open exactly when its cell on Stats is.
 */
export function openLeaveKeys(leaves: readonly LeaveStats[]): Set<string> {
  const convertible = leaves.filter((l) => l.chances > 0).sort(byMostLeft);
  return new Set(previewSplit(convertible, FREE_LEAVES).shown.map((l) => keyOf(l.pins)));
}

/** Whether one leave's record is open without Pro (see `openLeaveKeys`). */
export function isOpenLeave(leaves: readonly LeaveStats[], pins: readonly number[]): boolean {
  return openLeaveKeys(leaves).has(keyOf(pins));
}
