import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { plural, t } from "@lingui/core/macro";
import { ArrowRight } from "lucide-react";
import { PALETTES } from "../lib/palette";
import { DEFAULT_ASYMMETRIC, DEFAULT_PAP, readMotion } from "../lib/ballLayout";
import { defaultOrientationFor } from "../lib/ballProjection";
import { oilBands, oilZones, peakUnits } from "../lib/oilPattern";
import type { OilPass } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { BallLayoutDiagram } from "./BallLayoutDiagram";
import { CatalogBallImage } from "./CatalogBallImage";
import { LaneSurface, type OilOverlay } from "./LaneSurface";
import { MotionRail } from "./MotionRail";

/**
 * What Pro opens, for the Pro page (ADR-164, ADR-170), drawn by the screens'
 * own components with sample numbers: the real leave cells, the real lane and
 * the real ball. A hand-drawn picture of each read as a
 * mock-up, and the page is the bowler's one look at what they would get. They
 * follow the theme like the screens do, and change when the screens change.
 *
 * Every one is decoration: the card around it says the same thing in words, so
 * each is hidden from screen readers and out of reach of a tap.
 */

/** A sample, inert: it is a picture of a screen, not a working one. */
function Sample({
  className = "",
  lane = false,
  children
}: {
  className?: string;
  /** The lane's own dark ground in both themes, for a sample that is a lane
   *  (DESIGN-LANGUAGE §3, the lane exception). A variant rather than a colour
   *  in `className`, which lost to the sunken ground and left the line's
   *  white numbers on cream in the light theme. */
  lane?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop.
  useEffect(() => ref.current?.setAttribute("inert", ""), []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden rounded-lg p-2.5 ${
        lane ? "bg-slate-900" : "bg-surface-sunken"
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}

const BALLS: Array<{ name: string; brand: Manufacturer; thumb: string; balls: number; rates: string[] }> = [
  {
    name: "Phaze II",
    brand: "Storm",
    thumb: "/catalog/img/storm-phaze-2-2019-p2-thumb.webp",
    balls: 214,
    rates: ["74%", "70%", "52%", "9.1"]
  },
  {
    name: "Idol",
    brand: "Roto Grip",
    thumb: "/catalog/img/roto-grip-idol-2018-p2-thumb.webp",
    balls: 131,
    rates: ["68%", "66%", "45%", "8.8"]
  },
  {
    name: "Purple Pearl Urethane 78D",
    brand: "Hammer",
    thumb: "/catalog/img/hammer-purple-pearl-urethane-78d-2026-p2-thumb.webp",
    balls: 88,
    rates: ["61%", "59%", "36%", "8.4"]
  }
];

/** A ball's game-by-game rates, as its details open under its line. Built in
 *  render, since the labels are read in the language of the day. */
function byGameRows(): Array<[string, string[]]> {
  return [
    [t({ message: "Pocket", comment: "Bowling term: the strike pocket, where the ball should hit the pins. A rate label." }), ["78%", "75%", "69%"]],
    [t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket carried for a strike. A rate label." }), ["74%", "71%", "64%"]],
    [t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. A rate label." }), ["58%", "53%", "44%"]],
    [t({ message: "1st ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" }), ["9.3", "9.1", "8.8"]],
    [t({ message: "X-on-X", comment: "Bowling term: a strike on the ball right after a strike. Short form for a column heading: X is the strike mark on a scoresheet" }), ["55%", "49%", "41%"]]
  ];
}

/** Each ball's rates side by side, the first one open on its by-game
 *  details, as the All balls sheet draws them. */
export function BallsSample() {
  const headings = [t({ message: "Pocket", comment: "Bowling term: the strike pocket, where the ball should hit the pins. A rate label." }), t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket carried for a strike. A rate label." }), t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. A rate label." }), t({ message: "1st ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" })];
  return (
    <Sample>
      <div className="rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
        <div className="flex gap-1 pb-1 text-caption-2 font-semibold uppercase leading-tight text-ink-tertiary">
          <span className="min-w-0 flex-1" />
          {headings.map((h) => (
            <span key={h} className="w-10 shrink-0 text-right">
              {h}
            </span>
          ))}
        </div>
        {BALLS.slice(0, 2).map((ball, n) => (
          <div key={ball.name} className="border-t border-edge py-1.5">
            <div className="flex items-center gap-1 text-footnote">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="h-7 w-7 shrink-0">
                  <CatalogBallImage src={ball.thumb} alt="" brand={ball.brand} size="thumb" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight text-ink-strong">{ball.name}</span>
                  <span className="block text-caption-2 tabular-nums text-ink-tertiary">{plural(ball.balls, { one: "# ball", other: "# balls" })}</span>
                </span>
              </span>
              {ball.rates.map((rate, i) => (
                <span key={i} className="w-10 shrink-0 text-right font-semibold tabular-nums text-ink">
                  {rate}
                </span>
              ))}
            </div>
            {n === 0 && (
              <table className="mt-2 w-full rounded-lg bg-surface-muted text-caption-2 tabular-nums">
                <thead>
                  <tr className="text-ink-tertiary">
                    <th className="px-2 pt-1.5 text-left font-semibold">{t`By game`}</th>
                    {[1, 2, 3].map((g) => (
                      <th key={g} className="w-10 pt-1.5 text-center font-semibold">
                        {g}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-ink-secondary">
                  {byGameRows().map(([label, cells]) => (
                    <tr key={label}>
                      <td className="px-2 text-left">{label}</td>
                      {cells.map((c, i) => (
                        <td key={i} className="w-10 text-center">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </Sample>
  );
}

/** The first ball's chain and its three smaller numbers, as the First ball
 *  card draws them with Pro. */
export function FirstBallSample() {
  const chain: Array<[string, string, boolean]> = [
    [t({ message: "Pocket", comment: "Bowling term: the strike pocket, where the ball should hit the pins. A rate label." }), "74%", false],
    [t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket carried for a strike. A rate label." }), "70%", false],
    [t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. A rate label." }), "52%", true]
  ];
  return (
    <Sample>
      <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-center">
          {chain.map(([label, value, lead], i) => (
            <Fragment key={label}>
              {i > 0 && <ArrowRight size={14} className="text-ink-tertiary" />}
              <div>
                <p className={`text-2xl font-bold tabular-nums ${lead ? "text-accent" : "text-ink"}`}>{value}</p>
                <p className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
              </div>
            </Fragment>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 border-t border-edge pt-2.5 text-center">
          {[
            ["9.1", t({ message: "1st ball avg", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins; avg is short for average" })],
            ["49%", t({ message: "Strike on strike", comment: "Bowling term: a strike on the ball right after a strike" })],
            ["9", t({ message: "Strikes in a row", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" })]
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-base font-bold leading-tight tabular-nums text-ink">{value}</p>
              <p className="text-xs text-ink-secondary">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </Sample>
  );
}

const ALLEY_BALLS: Array<{
  name: string;
  brand: Manufacturer;
  thumb: string;
  rates: string[];
  est: number;
  diff: number;
}> = [
  {
    name: "Phaze II",
    brand: "Storm",
    thumb: "/catalog/img/storm-phaze-2-2019-p2-thumb.webp",
    rates: ["58%", "55%", "9%", "71%"],
    est: 211,
    diff: 9
  },
  {
    name: "Idol",
    brand: "Roto Grip",
    thumb: "/catalog/img/roto-grip-idol-2018-p2-thumb.webp",
    rates: ["51%", "49%", "12%", "66%"],
    est: 203,
    diff: 1
  },
  {
    name: "Purple Pearl Urethane 78D",
    brand: "Hammer",
    thumb: "/catalog/img/hammer-purple-pearl-urethane-78d-2026-p2-thumb.webp",
    rates: ["40%", "36%", "15%", "78%"],
    est: 194,
    diff: -8
  }
];

/** What you would average with each ball at one alley, on one pair of lanes,
 *  with the rates behind it, as the Alley report lists it. */
export function AlleySample() {
  const headings = [
    t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. A rate label." }),
    t({ message: "After strike", comment: "Bowling term. A short column heading over the share of strikes thrown right after a strike." }),
    t({ message: "Splits", comment: "Bowling term. A short column heading over the share of leaves that were splits." }),
    t({ message: "Made", comment: "Bowling term. A short column heading over the share of leaves picked up for a spare." })
  ];
  const lanes = "11-12";
  return (
    <Sample>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        <span className="rounded-full bg-accent-fill px-3 py-1 text-accent-on-fill">Sea Bowl</span>
        <span className="rounded-full border border-edge-strong bg-surface px-3 py-1 text-ink-strong">{plural(2, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` })}</span>
      </div>
      <div className="overflow-hidden rounded-[22px] bg-surface">
        <div className="flex items-end gap-1 px-3 pb-1 pt-2 text-caption-2 font-semibold uppercase leading-tight text-ink-tertiary">
          <span className="min-w-0 flex-1" />
          {headings.map((h) => (
            <span key={h} className="w-8 shrink-0 text-center">
              {h}
            </span>
          ))}
          <span className="w-9 shrink-0 text-right">{t({ message: "Est.", comment: "Short column heading: estimated average." })}</span>
        </div>
        {ALLEY_BALLS.map((ball) => (
          <div key={ball.name} className="flex items-center gap-1 border-t border-edge px-3 py-2 text-caption">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="h-6 w-6 shrink-0">
                <CatalogBallImage src={ball.thumb} alt="" brand={ball.brand} size="thumb" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{ball.name}</span>
            </span>
            {ball.rates.map((rate, i) => (
              <span key={i} className="w-8 shrink-0 text-center tabular-nums text-ink">
                {rate}
              </span>
            ))}
            <span className="w-9 shrink-0 text-right leading-tight">
              <span className="block font-bold tabular-nums text-ink">~{ball.est}</span>
              <span
                className={`block text-caption-2 tabular-nums ${ball.diff > 0 ? "text-success-700" : ball.diff < 0 ? "text-danger-700" : "text-ink-tertiary"}`}
              >
                {ball.diff > 0 ? `+${ball.diff}` : ball.diff < 0 ? `−${Math.abs(ball.diff)}` : "0"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Sample>
  );
}

/** A house shot: a 40 ft crown in the middle and lighter oil out to the edges. */
const HOUSE_SHOT: OilPass[] = [
  { direction: "forward", start_distance: 0, end_distance: 40, left_board: 3, right_board: 37, loads: 2, microliters: 50 },
  { direction: "forward", start_distance: 0, end_distance: 36, left_board: 10, right_board: 30, loads: 2, microliters: 50 },
  { direction: "reverse", start_distance: 34, end_distance: 3, left_board: 13, right_board: 27, loads: 2, microliters: 50 }
];

const ZONES = oilZones(HOUSE_SHOT);
const OIL: OilOverlay = {
  bands: oilBands(ZONES),
  peak: peakUnits(ZONES),
  length: 40,
  exit: { board: 7, feet: 40 }
};

const LINE = { stance: 23, laydown: 18, target: 12, breakpoint: 7, breakpoint_distance: 42 };

/** A line on the lane over the oil, with the three points that move it. */
export function LineSample() {
  const pegs: Array<[string, number]> = [
    [t({ message: "Laydown", comment: "Bowling term: the board the ball first touches the lane" }), LINE.laydown],
    [t({ message: "Target", comment: "Bowling term: the board the ball crosses at the arrows." }), LINE.target],
    [t({ message: "Breakpoint", comment: "Bowling term: the point where the ball turns from skid to hook" }), LINE.breakpoint]
  ];
  return (
    <Sample lane className="flex items-center justify-center gap-4 py-3">
      <div className="h-64 w-[5.5rem] shrink-0">
        <LaneSurface line={LINE} hand="right" oil={OIL} />
      </div>
      <dl className="space-y-2">
        {pegs.map(([label, board]) => (
          <div key={label} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-white">
            <dt className="text-caption-2 font-semibold uppercase tracking-wide text-white/70">{label}</dt>
            <dd className="text-base font-bold tabular-nums">{board}</dd>
          </div>
        ))}
      </dl>
    </Sample>
  );
}

const SAMPLE_LAYOUT = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

/** The layout lab as it opens: its ball, drilled 45 x 4 1/2 x 45, with the
 *  rail of what it will do beside it (ADR-209). */
export function LayoutSample() {
  return (
    <Sample className="flex items-center justify-center gap-2 py-2">
      <div className="w-full max-w-[13rem]">
        <BallLayoutDiagram
          layout={SAMPLE_LAYOUT}
          ball={DEFAULT_ASYMMETRIC}
          pap={DEFAULT_PAP}
          orientation={defaultOrientationFor("right")}
          onOrientationChange={() => {}}
          hand="right"
          crop={44}
        />
      </div>
      <MotionRail motion={readMotion(SAMPLE_LAYOUT, DEFAULT_ASYMMETRIC)} className="w-20 shrink-0" />
    </Sample>
  );
}

/** The colors Pro adds, beside the one every bowler has. */
export function ThemesSample() {
  return (
    <Sample className="flex h-20 items-center justify-center gap-3">
      {PALETTES.map((palette) => (
        <span
          key={palette.id}
          className="h-9 w-9 rounded-full border-2 border-surface shadow-sm"
          style={{ backgroundColor: palette.swatch }}
        />
      ))}
    </Sample>
  );
}
