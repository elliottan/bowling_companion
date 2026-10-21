import { useEffect, useRef, type ReactNode } from "react";
import { PALETTES } from "../lib/palette";
import { DEFAULT_ASYMMETRIC, DEFAULT_PAP } from "../lib/ballLayout";
import { defaultOrientationFor } from "../lib/ballProjection";
import { oilBands, oilZones, peakUnits } from "../lib/oilPattern";
import type { OilPass, PinNumber } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { BallLayoutDiagram } from "./BallLayoutDiagram";
import { CatalogBallImage } from "./CatalogBallImage";
import { LaneSurface, type OilOverlay } from "./LaneSurface";
import { MetricTrendChart, type MetricPoint } from "./MetricTrendChart";
import { MiniPins } from "./MiniPins";
import { FirstBallCard } from "./Stats";
import { GROUP_HEADING } from "./ui/typography";

/**
 * What Pro opens, for the Pro page (ADR-164, ADR-170), drawn by the screens'
 * own components with sample numbers: the real chart, the real first-ball card,
 * the real lane and the real ball. A hand-drawn picture of each read as a
 * mock-up, and the page is the bowler's one look at what they would get. They
 * follow the theme like the screens do, and change when the screens change.
 *
 * Every one is decoration: the card around it says the same thing in words, so
 * each is hidden from screen readers and out of reach of a tap.
 */

/** A sample, inert: it is a picture of a screen, not a working one. */
function Sample({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop.
  useEffect(() => ref.current?.setAttribute("inert", ""), []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden rounded-lg bg-surface-sunken p-2.5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

const STRIKES: Array<[string, number]> = [
  ["9/2", 38],
  ["9/9", 42],
  ["9/16", 35],
  ["9/23", 47],
  ["9/30", 44],
  ["10/7", 51],
  ["10/14", 49],
  ["10/21", 56]
];

/** Strikes by session, on the chart Stats draws for any stat. */
export function StatsSample() {
  const points: MetricPoint[] = STRIKES.map(([axis, value]) => ({ key: axis, axis, title: axis, value }));
  return (
    <Sample>
      <MetricTrendChart
        points={points}
        overall={45}
        format={(v) => `${Math.round(v)}%`}
        min={0}
        max={100}
        minSpan={20}
        header={
          <div className="mb-1 flex items-baseline justify-between">
            <span className={GROUP_HEADING}>Strike</span>
            <span className="text-xs text-ink-secondary">Strikes per first ball</span>
          </div>
        }
      />
    </Sample>
  );
}

/** The First ball card itself, with a league bowler's numbers. */
export function FirstBallSample() {
  return (
    <Sample>
      <FirstBallCard
        stats={{
          pocketPct: 71,
          carryPct: 68,
          strikePct: 48,
          firstBallAverage: 8.9,
          strikeOnStrikePct: 39,
          bestStreak: 6
        }}
      />
    </Sample>
  );
}

const LEAVES: Array<{ pins: PinNumber[]; made: number; of: number }> = [
  { pins: [10], made: 41, of: 46 },
  { pins: [7], made: 22, of: 27 },
  { pins: [3, 6, 10], made: 9, of: 13 },
  { pins: [2, 4, 5, 8], made: 5, of: 9 },
  { pins: [6, 10], made: 6, of: 10 },
  { pins: [7, 10], made: 1, of: 6 }
];

/** The leaves left most, each with how often it is made, as the Spares card
 *  draws them. */
export function LeavesSample() {
  return (
    <Sample>
      <ul className="grid grid-cols-3 gap-1.5">
        {LEAVES.map((leave) => {
          const rate = Math.round((100 * leave.made) / leave.of);
          return (
            <li
              key={leave.pins.join("-")}
              className="flex flex-col items-center gap-1 rounded-xl border border-edge bg-surface px-1.5 py-2 text-center shadow-sm"
            >
              <MiniPins standing={leave.pins} size="sm" />
              <div className="flex w-full items-baseline gap-1">
                <span className="min-w-0 flex-1 text-left text-[11px] tabular-nums text-ink-secondary">
                  {leave.made}/{leave.of}
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${rate >= 70 ? "text-accent" : "text-ink"}`}>
                  {rate}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Sample>
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

const BALL_HEADINGS = ["Pocket", "Carry", "Strike", "1st ball"];

/** Each ball's rates side by side, as the Balls card lists them. */
export function BallsSample() {
  return (
    <Sample>
      <div className="rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
        <div className="flex gap-1 pb-1 text-[9px] font-semibold uppercase leading-tight text-ink-tertiary">
          <span className="min-w-0 flex-1" />
          {BALL_HEADINGS.map((h) => (
            <span key={h} className="w-10 shrink-0 text-right">
              {h}
            </span>
          ))}
        </div>
        {BALLS.map((ball) => (
          <div key={ball.name} className="flex items-center gap-1 border-t border-edge py-1.5 text-[13px]">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="h-7 w-7 shrink-0">
                <CatalogBallImage src={ball.thumb} alt="" brand={ball.brand} size="thumb" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium leading-tight text-ink-strong">{ball.name}</span>
                <span className="block text-[10px] tabular-nums text-ink-tertiary">{ball.balls} balls</span>
              </span>
            </span>
            {ball.rates.map((rate, i) => (
              <span key={i} className="w-10 shrink-0 text-right font-semibold tabular-nums text-ink">
                {rate}
              </span>
            ))}
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

const PEGS: Array<[string, number]> = [
  ["Laydown", LINE.laydown],
  ["Target", LINE.target],
  ["Breakpoint", LINE.breakpoint]
];

/** A line on the lane over the oil, with the three points that move it. */
export function LineSample() {
  return (
    <Sample className="flex items-center justify-center gap-4 bg-slate-900 py-3">
      <div className="h-64 w-[5.5rem] shrink-0">
        <LaneSurface line={LINE} hand="right" oil={OIL} />
      </div>
      <dl className="space-y-2">
        {PEGS.map(([label, board]) => (
          <div key={label} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-white">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{label}</dt>
            <dd className="text-base font-bold tabular-nums">{board}</dd>
          </div>
        ))}
      </dl>
    </Sample>
  );
}

/** The layout lab's own ball, drilled 45 x 4 1/2 x 45. */
export function LayoutSample() {
  return (
    <Sample className="flex justify-center p-0">
      <div className="w-full max-w-[14rem]">
        <BallLayoutDiagram
          layout={{ drillingAngle: 45, pinToPap: 4.5, valAngle: 45 }}
          ball={DEFAULT_ASYMMETRIC}
          pap={DEFAULT_PAP}
          orientation={defaultOrientationFor("right")}
          onOrientationChange={() => {}}
          hand="right"
        />
      </div>
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
