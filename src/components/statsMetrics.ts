import { t } from "@lingui/core/macro";
import type { BowlingStats } from "../lib/stats";
import { formatFixed, formatNumber, formatPercent } from "../lib/format";

/** The stats the chart can plot, and how each one is drawn.
 *
 *  Every value is read off a `BowlingStats` that `calculateStats` produced, so
 *  the point on the line and the number on the card are the same call and
 *  cannot drift (ADR-061b). `min`/`max` are the bounds the metric cannot leave;
 *  `minSpan` is the smallest range the chart will draw, so a tidy run does not
 *  get magnified into a cliff. */
const METRICS = {
  average: {
    get label() {
      return t({ message: "Average", comment: "A bowling average: the score per game" });
    },
    value: (s: BowlingStats) => s.averageScore,
    format: (v: number) => formatNumber(Math.round(v)),
    min: 0,
    max: 300,
    minSpan: 80
  },
  pocketPct: {
    get label() {
      return t({ message: "Pocket", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" });
    },
    value: (s: BowlingStats) => s.pocketPct,
    format: (v: number) => formatPercent(v),
    min: 0,
    max: 100,
    minSpan: 25
  },
  sparePct: {
    get label() {
      return t({ message: "Spare", comment: "Bowling term: all remaining pins knocked down with the second ball of a frame" });
    },
    value: (s: BowlingStats) => s.sparePct,
    format: (v: number) => formatPercent(v),
    min: 0,
    max: 100,
    minSpan: 25
  },
  strikePct: {
    get label() {
      return t({ message: "Strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" });
    },
    value: (s: BowlingStats) => s.strikePct,
    format: (v: number) => formatPercent(v),
    min: 0,
    max: 100,
    minSpan: 25
  },
  strikeOnStrikePct: {
    // Spelled out where there is room. Where there is not, it is "X-on-X", the
    // scoresheet's own mark for a strike (STRIKE_ON_STRIKE_SHORT). "Double"
    // was tried and is not the same thing: a double is two strikes in a row,
    // where this is how often a strike was followed by another.
    get label() {
      return t({ message: "Strike on strike", comment: "Bowling term: a strike on the ball right after a strike" });
    },
    value: (s: BowlingStats) => s.strikeOnStrikePct,
    format: (v: number) => formatPercent(v),
    min: 0,
    max: 100,
    minSpan: 25
  },
  carryPct: {
    get label() {
      return t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" });
    },
    value: (s: BowlingStats) => s.carryPct,
    format: (v: number) => formatPercent(v),
    min: 0,
    max: 100,
    minSpan: 25
  },
  firstBallAverage: {
    get label() {
      return t({ message: "1st ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" });
    },
    value: (s: BowlingStats) => s.firstBallAverage,
    format: (v: number) => formatFixed(v, 1),
    min: 0,
    max: 10,
    minSpan: 2
  },
  bestStreak: {
    get label() {
      return t({ message: "Max consecutive strikes", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" });
    },
    value: (s: BowlingStats) => s.bestStreak,
    format: (v: number) => formatNumber(Math.round(v)),
    min: 0,
    max: 12,
    minSpan: 4
  }
} as const;

export type MetricKey = keyof typeof METRICS;

/** The metrics a picker can offer, in chip order. Exported so the Game-by-game
 *  screen can build the same picker over the same specs (ADR-063b). */
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** What each metric is called and how it is drawn, for anything outside this
 *  file that plots one. */
export function metricSpec(metric: MetricKey) {
  return METRICS[metric];
}

/** What a metric counts, in one line. */
export function metricNote(metric: MetricKey): string {
  return METRIC_NOTE[metric];
}

/** One line under the chart picker saying what the picked metric counts, always
 *  on (ADR-127). Behind an info button the definition was a tap nobody made, and
 *  a chip's one word ("Streak", "Carry") does not say it. Kept to one line on a
 *  phone, so short enough to read in passing. */
const METRIC_NOTE: Record<MetricKey, string> = {
  get average() {
    return t`Your score per finished game.`;
  },
  get strikePct() {
    return t({ message: "First balls at a full rack that struck.", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" });
  },
  get strikeOnStrikePct() {
    return t({ message: "Strikes the next ball struck too.", comment: "Bowling term: a strike on the ball right after a strike" });
  },
  get bestStreak() {
    return t({ message: "Most strikes in a row in one game.", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" });
  },
  get sparePct() {
    return t({ message: "Makeable leaves made. Not splits or washouts.", comment: "Bowling terms: a makeable leave is a set of standing pins that can be converted to a spare; a split leaves gaps between pins; a washout is a leave with the head pin standing and a gap behind it" });
  },
  get pocketPct() {
    return t({ message: "First balls that hit the pocket.", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" });
  },
  get carryPct() {
    return t({ message: "Pocket hits that struck.", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" });
  },
  get firstBallAverage() {
    return t({ message: "Pins the first ball knocks down, on average.", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" });
  }
};
