/**
 * A line as a link, and a link back as a line.
 *
 * The same shape as `layoutShare.ts`, and for the same reasons: the parameters
 * ride in the URL's **search** string, before the hash, because `appRoute.ts` is
 * a projection of navigation state and a line is not a screen, it is what the
 * screen is showing. The hash still says where to go, and the sandbox already
 * has a route (`#/home/line`), so a shared line opens the screen that was
 * already built to hold one.
 *
 *   https://headpin.app/score?ld=20&tg=15&fb=17.5&hand=right&pat=chromium-6742#/home/line
 *
 * Every field is optional on the way in. A half-written or hand-edited link
 * opens the sandbox on whatever it could read rather than failing: a bad link
 * should still show a lane.
 *
 * **The pattern travels as its catalog id, and only as that.** A name is the
 * bowler's to change (ADR-105), so two people who both bowl Chromium may call it
 * two things and a name would match neither reliably. A pattern with no catalog
 * id is somebody's own row, whose load table exists on one device, so it is left
 * out of the link entirely rather than sent as a name that draws nothing.
 *
 * Pure, React-free and Dexie-free, per the `lib/` layering rule.
 */

import type { Handedness, LineSpec, PinNumber } from "../types/bowling";

/** Everything a shared link carries: the line, the bowler, the lane. */
export interface SharedLine {
  line: LineSpec;
  hand: Handedness;
  /** A spare line is aimed at a leave, so the leave rides along or the line
   *  means nothing: the same boards at a different rack are a different shot. */
  spare?: boolean;
  leave?: PinNumber[];
  /** `catalog_id` of the pattern the line was drawn against, where it has one. */
  patternCatalogId?: string;
}

export const LINE_SANDBOX_HASH = "#/home/line";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** At most one decimal, trailing zeros stripped: a board is meaningful to a
 *  half and a link has to survive being pasted into a chat. */
const num = (v: number) => String(Math.round(v * 10) / 10);

/** The query string for a line, without the leading `?`. */
export function encodeLineParams(shared: SharedLine): string {
  const params = new URLSearchParams();
  const { line } = shared;
  const put = (key: string, v: number | undefined) => {
    if (v != null && Number.isFinite(v)) params.set(key, num(v));
  };
  put("ld", line.laydown ?? line.stance);
  put("tg", line.target);
  put("fb", line.final_board);
  put("fd", line.final_distance);
  put("hs", line.hook_start_distance);
  put("hl", line.hook_length);
  params.set("hand", shared.hand);
  if (shared.spare) params.set("sp", "1");
  if (shared.leave?.length) params.set("lv", [...shared.leave].sort((a, b) => a - b).join("."));
  if (shared.patternCatalogId) params.set("pat", shared.patternCatalogId);
  return params.toString();
}

/**
 * A full shareable URL.
 *
 * `origin` and `path` come from the running page rather than a constant, so a
 * link shared from a preview deployment opens that preview and one shared from
 * production opens production.
 */
export function lineShareUrl(shared: SharedLine, origin: string, path: string): string {
  return `${origin}${path}?${encodeLineParams(shared)}${LINE_SANDBOX_HASH}`;
}

/** A finite number inside a range, or undefined if the text was not one. */
function readNumber(raw: string | null, lo: number, hi: number): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? clamp(Math.round(v * 10) / 10, lo, hi) : undefined;
}

/** The pins of a leave, ignoring anything that is not one of the ten. */
function readLeave(raw: string | null): PinNumber[] | undefined {
  if (!raw) return undefined;
  const pins = raw
    .split(".")
    .map((p) => Number(p))
    .filter((p): p is PinNumber => Number.isInteger(p) && p >= 1 && p <= 10);
  return pins.length ? [...new Set(pins)].sort((a, b) => a - b) : undefined;
}

const KNOWN = ["ld", "tg", "fb", "fd", "hs", "hl", "hand", "sp", "lv", "pat"];

/**
 * Read a line out of a query string.
 *
 * Returns `null` when the query says nothing about a line at all, which is how
 * the caller tells "opened from a shared link" from "opened normally", and so
 * knows whether to override the bowler's own hand and the sandbox's own line.
 */
export function decodeLineParams(search: string): SharedLine | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!KNOWN.some((key) => params.has(key))) return null;

  const line: LineSpec = {};
  const ld = readNumber(params.get("ld"), 1, 59);
  const tg = readNumber(params.get("tg"), 1, 39);
  const fb = readNumber(params.get("fb"), 1, 39);
  const fd = readNumber(params.get("fd"), 40, 63);
  const hs = readNumber(params.get("hs"), 10, 62);
  const hl = readNumber(params.get("hl"), 1, 50);
  if (ld != null) line.laydown = ld;
  if (tg != null) line.target = tg;
  if (fb != null) line.final_board = fb;
  if (fd != null) line.final_distance = fd;
  if (hs != null) line.hook_start_distance = hs;
  if (hl != null) line.hook_length = hl;

  const pat = params.get("pat")?.trim();
  const leave = readLeave(params.get("lv"));
  return {
    line,
    hand: params.get("hand") === "left" ? "left" : "right",
    // A leave with no spare flag is still a spare line: the leave is the thing
    // that makes it one, and a link trimmed by a chat app loses flags first.
    ...(params.get("sp") === "1" || leave ? { spare: true } : {}),
    ...(leave ? { leave } : {}),
    ...(pat ? { patternCatalogId: pat.slice(0, 64) } : {})
  };
}
