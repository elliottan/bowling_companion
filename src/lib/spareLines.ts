import type { Handedness, PinNumber, SpareLine } from "../types/bowling";
import { isBabySplit, isPocketLeave, isSleeper, spareGroup, uniquePins } from "./pins";

/** The pins as one string, the way spare lines and leaves are keyed. */
export function leaveKey(pins: PinNumber[]): string {
  return uniquePins(pins).join("-");
}

/** The spare lines a bowler sees and is asked about: every leave but a pocket
 *  leave, which is shot on the strike line and has no spare line (ADR-123). A
 *  row saved for one before stays stored, and is only left out. */
export function spareLinesShown<T extends Pick<SpareLine, "pins">>(lines: T[]): T[] {
  return lines.filter((sl) => !isPocketLeave(sl.pins));
}

/** A line with a board on it. A seeded leave with nothing written down is a
 *  row without an answer, and counts as no line. */
export function hasLine(sl: Pick<SpareLine, "line"> | undefined): boolean {
  return sl?.line?.stance != null || sl?.line?.target != null;
}

/** A strike-ball move to make: a leave whose answer is "two right of wherever
 *  you are playing" (ADR-053), with or without boards of its own. */
export function hasMove(sl: Pick<SpareLine, "strike_offset"> | undefined): boolean {
  return !!sl?.strike_offset?.stance || !!sl?.strike_offset?.target;
}

/** A leave the bowler has written an answer for: boards, a strike-ball move,
 *  or both. This is what "has a line" means on the screen, so a leave shot only
 *  with a strike ball is not asked for again. */
export function hasAnswer(sl: Pick<SpareLine, "line" | "strike_offset"> | undefined): boolean {
  return hasLine(sl) || hasMove(sl);
}

/**
 * A strike-ball move in words: "2 left", "1.5 right". The move is stored as
 * signed boards (ADR-053), and boards count from the bowler's own gutter, so
 * up the boards is left for a right-hander and right for a left-hander. A bare
 * "-2" asks the bowler to do that sum at the lane; a direction does not.
 */
export function describeMove(boards: number, handedness: Handedness): string {
  if (boards === 0) return "None";
  const upIsLeft = handedness === "right";
  const side = boards > 0 === upIsLeft ? "left" : "right";
  return `${Math.abs(boards)} ${side}`;
}

/** What two lines are compared by: the two boards a bowler acts on. The rest
 *  of the spec (hook, depth) is how it was drawn, not where to stand and aim. */
function boardsKey(sl: SpareLine): string | null {
  if (hasLine(sl)) return `${sl.line?.stance ?? "-"}|${sl.line?.target ?? "-"}`;
  // No boards, only a move: leaves with the same move are the same answer.
  if (hasMove(sl)) return `move:${sl.strike_offset?.stance ?? "-"}|${sl.strike_offset?.target ?? "-"}`;
  return null;
}

/**
 * Leaves that share a line, as one stack each, in list order: a stack sits
 * where its first leave sits. Nothing is stored about the grouping. Two
 * leaves are together because their boards are the same, so changing one
 * leave's line takes it out of its stack by itself, and copying a line into
 * one puts it in. A leave with no line stands alone.
 */
export function stackByLine(lines: SpareLine[]): SpareLine[][] {
  const stacks: SpareLine[][] = [];
  const byKey = new Map<string, SpareLine[]>();
  for (const sl of lines) {
    const key = boardsKey(sl);
    const stack = key ? byKey.get(key) : undefined;
    if (stack) {
      stack.push(sl);
    } else {
      const next = [sl];
      stacks.push(next);
      if (key) byKey.set(key, next);
    }
  }
  return stacks;
}

/**
 * Two leaves likely thrown with the same line: both have more than one pin,
 * they differ by exactly one pin, and the shot is aimed the same way. The same
 * front pin, the same group (makeable, washout, split), and a sleeper in both
 * or neither. The sleeper is what decides it: 2-4-8 and 2-4-5-8 are one shot
 * at the 2-8, but 2-4-5 has nothing hiding behind the 2 and is often a
 * different ball altogether.
 */
export function sameShot(a: PinNumber[], b: PinNumber[]): boolean {
  const pa = uniquePins(a);
  const pb = uniquePins(b);
  if (pa.length < 2 || pb.length < 2) return false;
  if (Math.abs(pa.length - pb.length) !== 1) return false;
  const [small, big] = pa.length < pb.length ? [pa, pb] : [pb, pa];
  if (!small.every((p) => big.includes(p))) return false;
  if (pa[0] !== pb[0]) return false;
  if (isSleeper(pa) !== isSleeper(pb)) return false;
  return spareGroup(pa) === spareGroup(pb);
}

export interface LineSuggestion {
  /** The leave with no line yet. */
  pins: PinNumber[];
  /** The saved line it would copy. */
  from: SpareLine;
}

/** The key a dismissed suggestion is remembered by. */
export function suggestionKey(s: LineSuggestion): string {
  return `${leaveKey(s.pins)}<${leaveKey(s.from.pins)}`;
}

/**
 * Lines worth copying: for each leave the bowler has faced or listed that has
 * no line, a saved line for the same shot (`sameShot`). Most-faced first, so
 * the one that saves the most typing leads. One suggestion per leave, from the
 * first matching line in list order. Pocket leaves take no part, on either side.
 */
export function suggestLineCopies(
  faced: Array<{ pins: PinNumber[]; attempts: number }>,
  lines: SpareLine[],
  dismissed: ReadonlySet<string> = new Set()
): LineSuggestion[] {
  const shown = spareLinesShown(lines);
  const withLine = shown.filter(hasAnswer);
  const lined = new Set(withLine.map((sl) => leaveKey(sl.pins)));
  const attempts = new Map<string, { pins: PinNumber[]; attempts: number }>();
  for (const f of spareLinesShown(faced)) attempts.set(leaveKey(f.pins), { pins: uniquePins(f.pins), attempts: f.attempts });
  for (const sl of shown) {
    const key = leaveKey(sl.pins);
    if (!attempts.has(key)) attempts.set(key, { pins: uniquePins(sl.pins), attempts: 0 });
  }

  const out: LineSuggestion[] = [];
  const candidates = [...attempts.entries()]
    .filter(([key]) => !lined.has(key))
    .sort((a, b) => b[1].attempts - a[1].attempts);
  for (const [, { pins }] of candidates) {
    const from = withLine.find(
      (sl) => sameShot(pins, sl.pins) && !dismissed.has(suggestionKey({ pins, from: sl }))
    );
    if (from) out.push({ pins, from });
  }
  return out;
}

/** The filters on the spare lines screen. Two kinds: what the leave is, and
 *  whether it has a line. Within a kind any one may match; across kinds all
 *  must, so "Sleepers" and "No line yet" is the sleepers still to write. */
export type SpareFilter = "single" | "sleeper" | "baby" | "withLine" | "noLine";

export const SPARE_FILTERS: ReadonlyArray<{ id: SpareFilter; label: string }> = [
  { id: "single", label: "Single pins" },
  { id: "sleeper", label: "Sleepers" },
  { id: "baby", label: "Baby splits" },
  { id: "withLine", label: "Has a line" },
  { id: "noLine", label: "No line yet" }
];

const SHAPE: Record<"single" | "sleeper" | "baby", (pins: PinNumber[]) => boolean> = {
  single: (pins) => uniquePins(pins).length === 1,
  sleeper: isSleeper,
  baby: isBabySplit
};

export function matchesFilters(sl: SpareLine, filters: ReadonlySet<SpareFilter>): boolean {
  const shapes = (["single", "sleeper", "baby"] as const).filter((f) => filters.has(f));
  if (shapes.length && !shapes.some((f) => SHAPE[f](sl.pins))) return false;
  const statuses = (["withLine", "noLine"] as const).filter((f) => filters.has(f));
  if (statuses.length && !statuses.some((f) => (f === "withLine") === hasAnswer(sl))) return false;
  return true;
}

/**
 * The leave the bowler faces most that has no line yet, so the screen can ask
 * for that one first. Only leaves a ball could follow, as on Stats, and never a
 * pocket leave, which needs no spare line.
 */
export function mostLeftWithoutLine(
  leaves: Array<{ pins: PinNumber[]; attempts: number; chances: number }>,
  lines: SpareLine[]
): { pins: PinNumber[]; attempts: number } | undefined {
  const withLine = new Set(lines.filter(hasAnswer).map((sl) => leaveKey(sl.pins)));
  return spareLinesShown(leaves)
    .filter((l) => l.chances > 0 && !withLine.has(leaveKey(l.pins)))
    .sort((a, b) => b.attempts - a.attempts)[0];
}
