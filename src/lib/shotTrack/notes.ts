import type { ShotFound } from "./shotStart";
import type { BallSearch } from "./ballFind";
import type { LaneEvidence, LaneVerdict } from "./laneVerdict";
import type { RunVerdict, ShotWindow } from "./shotWindow";

/**
 * What the shot tracer did, for the "Details:" block on each of its end
 * screens (Settings, Labs): a few lines of technical English the owner can
 * screenshot from a phone, whose console no one here can see. Each line has
 * a key, kept in the order first written; writing a key again replaces it,
 * `add` appends to it.
 */
export class Notes {
  private readonly lines = new Map<string, string>();

  set(key: string, text: string): void {
    this.lines.set(key, text);
  }

  add(key: string, text: string): void {
    const was = this.lines.get(key);
    this.lines.set(key, was ? `${was}; ${text}` : text);
  }

  get(key: string): string | undefined {
    return this.lines.get(key);
  }

  text(): string {
    return [...this.lines].map(([k, v]) => `${k}: ${v}`).join("\n");
  }
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

/** A grey picture's mean, least and most, as "mean/min/max": all-black or washed-out frames show here. */
export function grayStats(data: ArrayLike<number>): string {
  if (!data.length) return "empty";
  let sum = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    sum += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return `${Math.round(sum / data.length)}/${lo}/${hi}`;
}

/** What the first look's search answered. */
export function foundNote(found: ShotFound | null): string {
  if (!found) return "no run found";
  const runs = 1 + (found.others?.length ?? 0);
  return (
    `release ${f2(found.release)} s, pins ${found.pinHit === null ? "not seen" : `${f2(found.pinHit)} s`}, confidence ${f2(found.confidence)}` +
    `${found.guessed ? ", guessed (no run passed in the picture)" : ""}, ${runs} run${runs === 1 ? "" : "s"}, run ${found.run.length} points from y ${f2(found.run[0]?.y ?? NaN)}`
  );
}

/** Each run's verdict in feet, counted: "ball 1, too-slow 2". */
export function verdictNote(verdicts: readonly RunVerdict[]): string {
  if (!verdicts.length) return "no runs";
  const counts = new Map<RunVerdict, number>();
  for (const v of verdicts) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([v, n]) => `${v} ${n}`).join(", ");
}

/** The window chosen. */
export function windowNote(w: ShotWindow): string {
  return `${w.foul === null ? "foul line not found" : `foul line ${f2(w.foul)} s`}, end ${f2(w.end)} s by ${w.by}${w.speed !== null ? ` (${f1(w.speed)} ft/s)` : ""}`;
}

/** What the search for the ball in a part's frames found (`ballFind.ts`). */
export function ballNote(b: BallSearch): string {
  const what = b.seen ? `foul line ${f2(b.seen.foul)} s at ${f1(b.seen.speed)} ft/s` : b.earlier !== null ? `over the foul line about ${f2(b.earlier)} s` : "not seen";
  return `${what}: ${b.why}, ${b.candidates} candidates`;
}

/**
 * The lane check and what it was decided on: "check (pins-off), kept 7 of 24
 * (7 elsewhere), pins 3 within 0.65 bd, edges 0.58/0.60, 3 pins in the fit,
 * camera 20.2 ft". A phone that warned the lane may be off says why here
 * (2026-11-27, 6602: the warning on the phone, none on the same clip read in
 * Node, and nothing in the details to tell which doubt it was).
 */
export function laneCheckNote(v: LaneVerdict, e: LaneEvidence): string {
  const parts = [v.reasons.length ? `${v.level} (${v.reasons.join(", ")})` : v.level];
  if (e.kept !== undefined) parts.push(`kept ${e.kept} of ${e.kept + (e.dropped ?? 0)}${e.elsewhere ? ` (${e.elsewhere} elsewhere)` : ""}`);
  if (e.pinCheck !== undefined) parts.push(e.pinCheck === null ? "no pins checked" : `pins ${e.pinsSeen ?? "?"} within ${f2(e.pinCheck)} bd`);
  if (e.support) parts.push(`edges ${f2(e.support.left)}/${f2(e.support.right)}`);
  if (e.pinsUsed !== undefined) parts.push(`${e.pinsUsed} pin${e.pinsUsed === 1 ? "" : "s"} in the fit`);
  if (e.camera !== undefined) parts.push(`camera ${f1(e.camera)} ft`);
  if (e.guess) parts.push(`foul line guessed (${e.guess.foul})`);
  return parts.join(", ");
}

/** The stage times, seconds. */
export function timesNote(ms: { look: number; read: number; lane: number; trace: number }): string {
  return `look ${f1(ms.look / 1000)}, read ${f1(ms.read / 1000)}, lane ${f1(ms.lane / 1000)}, trace ${f1(ms.trace / 1000)} s`;
}
