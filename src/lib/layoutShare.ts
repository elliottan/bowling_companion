/**
 * A layout as a link, and a link back as a layout.
 *
 * The parameters ride in the URL's **search** string, before the hash, not
 * inside it. `appRoute.ts` is a projection of navigation state and nothing
 * else: its own doc says the hash can never describe a screen the reducer would
 * not produce. A layout is not a screen, it is what the screen is showing, so
 * putting it in the hash would make the nav projection carry content it has no
 * business owning, and every route test would have to know about drilling
 * angles. The search string is the part of a URL that has always meant "here is
 * some input for the page you are opening".
 *
 * So a shared layout looks like:
 *
 *   https://headpin.app/score?da=45&ptp=4.5&val=45&hand=right&grip=1h&over=5&up=0.5#/home/layout-lab
 *
 * The hash still says where to go, exactly as it does for every other screen,
 * and the query says what to put on it.
 *
 * Every field is optional on the way in. A link with half the parameters, or a
 * hand-edited one with nonsense in it, opens the lab on the defaults rather
 * than failing: a bad link should still show a bowling ball.
 *
 * Pure, React-free and Dexie-free, per the `lib/` layering rule.
 */

import {
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  MAX_ARC,
  clamp,
  type BallSpec,
  type DualAngleLayout,
  type PapMeasurement
} from "./ballLayout";
import type { GripStyle, Handedness } from "../types/bowling";

/** Everything a shared link carries: the layout, the ball, the bowler. */
export interface SharedLayout {
  layout: DualAngleLayout;
  ball: BallSpec;
  pap: PapMeasurement;
  hand: Handedness;
  /** One-handed or two-handed. Carried because it is part of who the layout
   *  was drilled for, the way the hand and the axis are, even while nothing
   *  downstream changes its arithmetic for it yet. */
  grip: GripStyle;
}

export const LAYOUT_LAB_HASH = "#/home/layout-lab";

export const DEFAULT_SHARED: SharedLayout = {
  layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 },
  ball: DEFAULT_ASYMMETRIC,
  pap: DEFAULT_PAP,
  hand: "right",
  grip: "1h"
};

/**
 * Numbers are written at most to three decimals and with trailing zeros
 * stripped, so a link reads `ptp=4.5` rather than `ptp=4.500`. The layout is
 * only ever meaningful to an eighth of an inch or a degree, so nothing is lost
 * and the link stays short enough to survive being pasted into a chat.
 */
const num = (v: number) => String(Math.round(v * 1000) / 1000);

/** The query string for a layout, without the leading `?`. */
export function encodeLayoutParams(shared: SharedLayout): string {
  const params = new URLSearchParams();
  params.set("da", num(shared.layout.drillingAngle));
  params.set("ptp", num(shared.layout.pinToPap));
  params.set("val", num(shared.layout.valAngle));
  params.set("core", shared.ball.symmetric ? "sym" : "asym");
  params.set("ptc", num(shared.ball.pinToCore));
  params.set("hand", shared.hand);
  params.set("grip", shared.grip);
  params.set("over", num(shared.pap.over));
  params.set("up", num(shared.pap.up));
  return params.toString();
}

/**
 * A full shareable URL.
 *
 * `origin` and `path` come from the running page rather than a constant, so a
 * link shared from a preview deployment opens that preview and a link shared
 * from production opens production. Hardcoding the production host would make
 * every link from a test build silently point somewhere else.
 */
export function layoutShareUrl(shared: SharedLayout, origin: string, path: string): string {
  return `${origin}${path}?${encodeLayoutParams(shared)}${LAYOUT_LAB_HASH}`;
}

/** A finite number inside a range, or undefined if the text was not one. */
function readNumber(raw: string | null, lo: number, hi: number): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? clamp(v, lo, hi) : undefined;
}

/**
 * Read a layout out of a query string, filling anything missing or unreadable
 * from the defaults.
 *
 * Returns `null` when the query carries nothing about a layout at all, which is
 * how the caller tells "opened from a shared link" from "opened normally" and
 * so knows whether to override the bowler's own stored PAP and handedness.
 */
export function decodeLayoutParams(search: string): SharedLayout | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const known = ["da", "ptp", "val", "core", "ptc", "hand", "grip", "over", "up"];
  if (!known.some((key) => params.has(key))) return null;

  const symmetric = params.get("core") === "sym";
  const base = symmetric ? DEFAULT_SYMMETRIC : DEFAULT_ASYMMETRIC;
  const hand = params.get("hand");

  return {
    layout: {
      drillingAngle: readNumber(params.get("da"), 0, 90) ?? DEFAULT_SHARED.layout.drillingAngle,
      pinToPap: readNumber(params.get("ptp"), 0, MAX_ARC) ?? DEFAULT_SHARED.layout.pinToPap,
      valAngle: readNumber(params.get("val"), 0, 90) ?? DEFAULT_SHARED.layout.valAngle
    },
    ball: { ...base, pinToCore: readNumber(params.get("ptc"), 0, MAX_ARC) ?? base.pinToCore },
    pap: {
      over: readNumber(params.get("over"), 0, 6.5) ?? DEFAULT_PAP.over,
      up: readNumber(params.get("up"), -3, 3) ?? DEFAULT_PAP.up
    },
    hand: hand === "left" ? "left" : "right",
    grip: params.get("grip") === "2h" ? "2h" : "1h"
  };
}
