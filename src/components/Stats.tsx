import { ArrowRight, BarChart3, ListFilter, TrendingDown, TrendingUp } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getSpareLinesAll } from "../services/ballRepository";
import { leaveKey, matchesLeaveFilters, matchesPins } from "../lib/spareLines";
import { useSpareFilters } from "../lib/useSpareFilters";
import { SpareFilterBar } from "./SpareFilterBar";
import { createPortal } from "react-dom";
import { useRememberedState } from "../lib/viewMemory";
import { CatalogBallImage } from "./CatalogBallImage";
import { MiniPins } from "./MiniPins";
import { LoadingCard } from "./ui/LoadingCard";
import { EmptyState } from "./ui/EmptyState";
import type { Manufacturer } from "../types/catalog";
import { formatLeave, SPARE_GROUP_LABEL, SPARE_GROUPS, spareGroup } from "../lib/pins";
import { SpareDetailsSheet } from "./SpareDetailsSheet";
import { FormSheet } from "./ui/FormSheet";
import { Chip, TAP_TARGET_44 } from "./ui/Chip";
import {
  RATE_LEADER_MIN_BALLS,
  type BallGameCell,
  type BallPerformance,
  type BallPerformanceReport,
  type BowlingStats,
  type GameMetricPoint,
  type LeaveStats,
  type SessionMetricPoint,
  type SessionTrendPoint
} from "../lib/stats";
import { BallGameSessionsDialog } from "./BallGameSessionsDialog";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { SessionTrendChart } from "./SessionTrendChart";
import { MetricTrendChart } from "./MetricTrendChart";
import type { Game } from "../types/bowling";
import { RECENT_SESSIONS, type RecentForm } from "../lib/statsRange";
import { GROUP_HEADING } from "./ui/typography";

/** The stats the chart can plot, and how each one is drawn.
 *
 *  Every value is read off a `BowlingStats` that `calculateStats` produced, so
 *  the point on the line and the number on the card are the same call and
 *  cannot drift (ADR-061b). `min`/`max` are the bounds the metric cannot leave;
 *  `minSpan` is the smallest range the chart will draw, so a tidy run does not
 *  get magnified into a cliff. */
const METRICS = {
  average: {
    label: "Average",
    value: (s: BowlingStats) => s.averageScore,
    format: (v: number) => String(Math.round(v)),
    min: 0,
    max: 300,
    minSpan: 80
  },
  strikePct: {
    label: "Strike",
    value: (s: BowlingStats) => s.strikePct,
    format: (v: number) => `${Math.round(v)}%`,
    min: 0,
    max: 100,
    minSpan: 25
  },
  strikeOnStrikePct: {
    label: "Strike on strike",
    value: (s: BowlingStats) => s.strikeOnStrikePct,
    format: (v: number) => `${Math.round(v)}%`,
    min: 0,
    max: 100,
    minSpan: 25
  },
  sparePct: {
    label: "Spare",
    value: (s: BowlingStats) => s.sparePct,
    format: (v: number) => `${Math.round(v)}%`,
    min: 0,
    max: 100,
    minSpan: 25
  },
  pocketPct: {
    label: "Pocket",
    value: (s: BowlingStats) => s.pocketPct,
    format: (v: number) => `${Math.round(v)}%`,
    min: 0,
    max: 100,
    minSpan: 25
  },
  carryPct: {
    label: "Carry",
    value: (s: BowlingStats) => s.carryPct,
    format: (v: number) => `${Math.round(v)}%`,
    min: 0,
    max: 100,
    minSpan: 25
  },
  firstBallAverage: {
    label: "1st ball",
    value: (s: BowlingStats) => s.firstBallAverage,
    format: (v: number) => v.toFixed(1),
    min: 0,
    max: 10,
    minSpan: 2
  },
  bestStreak: {
    label: "Max consecutive strikes",
    value: (s: BowlingStats) => s.bestStreak,
    format: (v: number) => String(Math.round(v)),
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

// Tapped definitions, for the numbers off the chart: the Spares heading and the
// Carry row of a ball's table.
const CARRY_NOTE = "Carry: pocket hits that struck.";
const SPARE_NOTE = "Spare: makeable leaves converted, excludes splits and washouts.";

/** One line under the chart picker saying what the picked metric counts, always
 *  on (ADR-127). Behind an info button the definition was a tap nobody made, and
 *  a chip's one word ("Streak", "Carry") does not say it. Kept to one line on a
 *  phone, so short enough to read in passing. */
const METRIC_NOTE: Record<MetricKey, string> = {
  average: "Your score per finished game.",
  strikePct: "First balls at a full rack that struck.",
  strikeOnStrikePct: "Strikes the next ball struck too.",
  bestStreak: "Most strikes in a row in one game.",
  sparePct: "Makeable leaves made. Not splits or washouts.",
  pocketPct: "First balls that hit the pocket.",
  carryPct: "Pocket hits that struck.",
  firstBallAverage: "Pins the first ball knocks down, on average."
};
const LEAVE_NOTE =
  "Made over chances, then the rate. A leave off the last ball of the 10th has no spare to follow it, so it is not on this card.";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballPerformance?: BallPerformanceReport;
  /** Open a specific game of a session. Wired where there is somewhere to go:
   *  a game-number column then opens the games behind it. The ball travels
   *  with it so the destination can show which shots it threw. */
  onOpenGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  /** Games of the session being shown, for the score trend. Omitted on the
   *  aggregate History screen, which passes `sessionTrend` instead: a line
   *  through games from different nights, houses and patterns draws a
   *  continuity that was never bowled, but a line through the nights
   *  themselves is exactly the form the filters are asking about. */
  games?: Array<Pick<Game, "game_number" | "final_score">>;
  /** One point per session, oldest first, for the History screen's trend. */
  sessionTrend?: SessionTrendPoint[];
  /** Every stat, per night, for whichever one the tiles have selected. */
  sessionMetrics?: SessionMetricPoint[];
  /** Every stat, per game, inside one session. The session sheet's answer to
   *  `sessionMetrics`: same tiles, one point per game rather than per night. */
  gameMetrics?: GameMetricPoint[];
  /** Open a session picked off the trend line. */
  onOpenSession?: (sessionId: number) => void;
  /** Open a game picked off the per-session score line. */
  onOpenGameId?: (gameId: number) => void;
  /** Names this screen's copy of what is expanded, so History and a session
   *  sheet remember their own. See `lib/viewMemory`. */
  memoryKey?: string;
  /** The last five sessions against the average, for the headline. Omitted
   *  inside a session, where there is nothing earlier to read them against. */
  form?: RecentForm | null;
  /** What an empty screen says, where the reason is not "you have never
   *  bowled": the Stats tab narrowed to three months with nothing in them. */
  empty?: { title: string; description: string };
  /** The filters and range behind these numbers, in words, for the All balls
   *  and All leaves sheets to carry (ADR-128). Omitted inside a session. */
  scopeLabel?: string;
}

export function Stats({
  stats,
  isLoading = false,
  leaves,
  ballPerformance,
  onOpenGame,
  games,
  sessionTrend,
  sessionMetrics,
  gameMetrics,
  onOpenSession,
  onOpenGameId,
  memoryKey = "stats",
  form,
  empty,
  scopeLabel
}: StatsProps) {
  // One note at a time, opened by tapping the stat it explains. A definition
  // read once is enough, so it stays a tap rather than permanent copy.
  const [note, setNote] = useState<string | null>(null);

  const toggleNote = (text: string) => setNote((curr) => (curr === text ? null : text));

  // A leave opened from its cell, and every leave opened from All leaves.
  const [openLeave, setOpenLeave] = useState<LeaveStats["pins"] | null>(null);
  const [allLeavesOpen, setAllLeavesOpen] = useState(false);
  // The All balls sheet, and the ball it opened on.
  const [ballsOpen, setBallsOpen] = useState<{ focus: number | null } | null>(null);

  // Which stat the chart is plotting. Remembered, so leaving the tab and
  // coming back does not silently drop you back on the average.
  const [metric, setMetric] = useRememberedState<MetricKey>(`${memoryKey}:metric`, "average");
  const spec = METRICS[metric];

  // One header for either chart: the picker, then one line saying what the
  // picked metric counts (ADR-127).
  const chartHeader = (
    <div className="mb-1">
      <div className="flex items-center gap-1">
        <div
          role="group"
          aria-label={`Chart by ${gameMetrics ? "game" : "session"}`}
          className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-1"
        >
          {METRIC_KEYS.map((key) => (
            <Chip
              key={key}
              selected={key === metric}
              onClick={() => setMetric(key)}
              className="shrink-0"
            >
              {METRICS[key].label}
            </Chip>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-secondary">{METRIC_NOTE[metric]}</p>
    </div>
  );

  if (isLoading) return <LoadingCard />;

  if (stats.totalGames === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={empty?.title ?? "No stats yet"}
        description={
          empty?.description ??
          "One finished game is enough to start. Strike rate, spare conversions and average come from there."
        }
      />
    );
  }

  // Only leaves a ball could follow. These are about converting, and a leave
  // off the last ball of the 10th has no spare to convert: it used to sit here
  // as a bare "0/0" with a "+1" beside it explaining why. The frequency it was
  // reported for is on the ball's own leaves.
  const convertible = (leaves ?? []).filter((l) => l.chances > 0);
  const leftMost = mostLeft(convertible);
  const ranked = byStrikeRate(ballPerformance?.balls ?? []);

  return (
    <div className="space-y-3">
      <Headline stats={stats} form={form} />

      {/* Inside a session the score line IS the average, so it answers to the
          picker like everything else. On the Stats tab there are no games and
          this branch never runs. */}
      {gameMetrics && gameMetrics.length > 0 && (
        metric === "average" ? (
          games &&
          games.length > 0 && (
            <ScoreTrendChart games={games} header={chartHeader} onOpenGame={onOpenGameId} />
          )
        ) : (
          <MetricTrendChart
            points={gameMetrics.map((p) => ({
              key: `g${p.gameId ?? p.gameNumber}`,
              axis: `G${p.gameNumber}`,
              title: `Game ${p.gameNumber}`,
              detail: p.lanes.length ? `Lane${p.lanes.length > 1 ? "s" : ""} ${p.lanes.join(", ")}` : undefined,
              value: spec.value(p.stats)
            }))}
            header={chartHeader}
            overall={spec.value(stats)}
            format={spec.format}
            min={spec.min}
            max={spec.max}
            minSpan={spec.minSpan}
            onOpen={
              onOpenGameId &&
              ((key) => {
                const id = Number(key.slice(1));
                if (Number.isInteger(id) && id > 0) onOpenGameId(id);
              })
            }
          />
        )
      )}

      {/* Per-game and per-session are alternatives, never both: a session
          sheet plots its games, the Stats tab plots its nights. */}
      {!gameMetrics &&
        (metric === "average"
        ? sessionTrend &&
          sessionTrend.length > 0 && (
            <SessionTrendChart
              sessions={sessionTrend}
              header={chartHeader}
              overall={stats.averageScore}
              onOpenSession={onOpenSession}
            />
          )
        : sessionMetrics &&
          sessionMetrics.length > 0 && (
            <MetricTrendChart
              points={sessionMetrics.map((p) => ({
                key: `s${p.sessionId ?? ""}:${p.date}`,
                axis: p.date.slice(5).replace("-", "/"),
                title: p.alley,
                detail: [p.event, `${p.games} ${p.games === 1 ? "game" : "games"}`]
                  .filter(Boolean)
                  .join(" · "),
                value: spec.value(p.stats)
              }))}
              header={chartHeader}
              overall={spec.value(stats)}
              format={spec.format}
              min={spec.min}
              max={spec.max}
              minSpan={spec.minSpan}
              onOpen={
                onOpenSession &&
                ((key) => {
                  const id = Number(key.slice(1).split(":")[0]);
                  if (Number.isInteger(id) && id > 0) onOpenSession(id);
                })
              }
            />
          ))}

      <FirstBallCard stats={stats} />

      {(stats.sparePct !== null || convertible.length > 0) && (
        <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2>
              <button type="button" onClick={() => toggleNote(SPARE_NOTE)} className={GROUP_HEADING}>
                Spares
              </button>
            </h2>
            {convertible.length > 0 && (
              <button
                type="button"
                onClick={() => setAllLeavesOpen(true)}
                className={`relative text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
              >
                All leaves
              </button>
            )}
          </div>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-ink">{pct(stats.sparePct)}</span>
            <span className="text-sm text-ink-secondary">
              made
            </span>
          </p>
          {note === SPARE_NOTE && (
            <div className="mt-2">
              <StatNote text={SPARE_NOTE} onDismiss={() => setNote(null)} />
            </div>
          )}
          {leftMost.length > 0 && (
            // Two rows on show, the rest a scroll away inside the card, with
            // the top of a third row peeking to say there is more.
            <div
              role="region"
              aria-label="Leaves left most"
              className="-mx-1 mt-3 max-h-[15.25rem] overflow-y-auto overscroll-y-contain px-1"
            >
              <LeaveGrid leaves={leftMost} onOpen={setOpenLeave} />
            </div>
          )}
        </section>
      )}

      {ranked.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className={GROUP_HEADING}>Balls</h2>
            <button
              type="button"
              onClick={() => setBallsOpen({ focus: null })}
              className={`relative text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              All balls
            </button>
          </div>
          <div className="mt-1">
            <BallRateHeadings />
            <ul className="divide-y divide-edge">
              {ranked.slice(0, TOP_BALLS).map((b) => (
                <li key={b.ballId}>
                  <button
                    type="button"
                    onClick={() => setBallsOpen({ focus: b.ballId })}
                    aria-label={`Open ${b.name}`}
                    className="flex w-full py-2 active:bg-surface-muted"
                  >
                    <BallSummary ball={b} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Portalled to the body: on the session sheet the stats sit inside a
          panel that slides on a transform, and a transformed ancestor makes
          `fixed` resolve against it, not the viewport. */}
      {ballsOpen &&
        createPortal(
          <AllBallsSheet
            balls={ranked}
            focusId={ballsOpen.focus}
            scopeLabel={scopeLabel}
            onOpenGame={onOpenGame}
            onClose={() => setBallsOpen(null)}
          />,
          document.body
        )}
      {allLeavesOpen &&
        createPortal(
          <AllLeavesSheet
            leaves={convertible}
            scopeLabel={scopeLabel}
            covered={openLeave !== null}
            onOpen={setOpenLeave}
            onClose={() => setAllLeavesOpen(false)}
          />,
          document.body
        )}
      {openLeave &&
        createPortal(
          <SpareDetailsSheet
            pins={openLeave}
            leaves={convertible}
            onClose={() => setOpenLeave(null)}
          />,
          document.body
        )}
    </div>
  );
}

/**
 * The one number the screen leads with (ADR-126): the average, large, with the
 * last five sessions against it, and the high, low and games under it. Eleven
 * tiles of equal weight used to sit here, and none of them read as the answer.
 */
function Headline({ stats, form }: { stats: BowlingStats; form?: RecentForm | null }) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <h2 className={GROUP_HEADING}>Average</h2>
      <p className="mt-1 text-5xl font-bold leading-none tabular-nums text-ink">
        {fmt(stats.averageScore)}
      </p>
      {form && <FormLine form={form} />}
      <dl className="mt-3 grid grid-cols-3 border-t border-edge pt-3">
        {(
          [
            ["High", fmt(stats.highGame)],
            ["Low", fmt(stats.lowGame)],
            ["Games", String(stats.completedGames)]
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-xs text-ink-secondary">{label}</dt>
            <dd className="text-lg font-bold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Recent form, said as a sentence. Never in red: a slower month is something
 *  to know, not something to be told off for. */
function FormLine({ form }: { form: RecentForm }) {
  const { average, difference } = form;
  const Icon = difference > 0 ? TrendingUp : difference < 0 ? TrendingDown : null;
  const against =
    difference === 0
      ? "level with your average"
      : `${Math.abs(difference)} ${difference > 0 ? "above" : "under"} your average`;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-secondary">
      {Icon && (
        <Icon
          size={16}
          aria-hidden="true"
          className={`mt-0.5 shrink-0 ${difference > 0 ? "text-accent" : "text-ink-tertiary"}`}
        />
      )}
      <span>
        <span className={`font-semibold tabular-nums ${difference > 0 ? "text-accent" : "text-ink"}`}>
          {average}
        </span>{" "}
        over your last {RECENT_SESSIONS} sessions, {against}
      </span>
    </p>
  );
}

/**
 * Pocket, carry and strike as the chain they are: of the first balls, these hit
 * the pocket, of those this many carried, and that is most of the strikes. As
 * three separate tiles the relationship between them was lost, and it is the
 * thing a bowler most needs from them: whether a low strike rate is a getting-
 * there problem or a carrying problem. The arrows say "leads to", not "equals":
 * a Brooklyn strike is a strike and not a pocket hit.
 */
function FirstBallCard({ stats }: { stats: BowlingStats }) {
  const links: Array<[string, string, boolean]> = [
    ["Pocket", pct(stats.pocketPct), false],
    ["Carry", pct(stats.carryPct), false],
    ["Strike", pct(stats.strikePct), true]
  ];
  return (
    <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={GROUP_HEADING}>First ball</h2>
        <span className="text-xs text-ink-secondary">
          <span className="font-semibold tabular-nums text-ink">{oneDp(stats.firstBallAverage)}</span>{" "}
          pins a ball
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-center">
        {links.map(([label, value, lead], i) => (
          <Fragment key={label}>
            {i > 0 && <ArrowRight size={14} aria-hidden="true" className="text-ink-tertiary" />}
            <div className="flex flex-col-reverse">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</dt>
              <dd className={`text-2xl font-bold tabular-nums ${lead ? "text-accent" : "text-ink"}`}>{value}</dd>
            </div>
          </Fragment>
        ))}
      </dl>
      <dl className="mt-3 flex justify-between gap-3 border-t border-edge pt-2 text-xs text-ink-secondary">
        <div className="flex gap-1">
          <dt>Strike on strike</dt>
          <dd className="font-semibold tabular-nums text-ink">{pct(stats.strikeOnStrikePct)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Max consecutive strikes</dt>
          <dd className="font-semibold tabular-nums text-ink">{fmt(stats.bestStreak)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Balls on the card; every one is on the All balls sheet. */
const TOP_BALLS = 5;

/** Times a leave must have been left to be on the Spares card. Fewer is a
 *  rate over a handful, and every leave is still under All leaves. */
const CARD_MIN_LEFT = 3;

/** The leaves left most, of every shape, most often first (ADR-129). What a
 *  bowler faces most is what the card leads with, whether they make it or not. */
function mostLeft(leaves: LeaveStats[]): LeaveStats[] {
  return leaves
    .filter((l) => l.attempts >= CARD_MIN_LEFT)
    .sort((a, b) => b.attempts - a.attempts || b.chances - a.chances);
}

/** Balls with enough throws behind them by strike rate, best first; the thin
 *  ones after, most thrown first, since a rate over a handful of balls ranks
 *  nothing. */
function byStrikeRate(balls: BallPerformance[]): BallPerformance[] {
  const thick = balls.filter((b) => b.firstBalls >= RATE_LEADER_MIN_BALLS);
  const thin = balls.filter((b) => b.firstBalls < RATE_LEADER_MIN_BALLS);
  return [
    ...thick.sort((a, b) => (b.strikePct ?? -1) - (a.strikePct ?? -1)),
    ...thin.sort((a, b) => b.firstBalls - a.firstBalls)
  ];
}

/** Tapped definition of a stat, dismissed by tapping it. */
function StatNote({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="w-full rounded-xl border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
    >
      {text}
    </button>
  );
}

/** The Pocket / Carry / Strike column widths, shared by the heading row and
 *  every ball, so each rate sits under the word that names it. */
const RATE_COLUMN = "w-12 shrink-0 text-right";

/** The headings over the three rates, spelled out: as single letters they had
 *  to be decoded before the row said anything. */
function BallRateHeadings() {
  return (
    <div
      className="flex items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary"
      aria-hidden="true"
    >
      <span className="min-w-0 flex-1" />
      <span className={RATE_COLUMN}>Pocket</span>
      <span className={RATE_COLUMN}>Carry</span>
      <span className={RATE_COLUMN}>Strike</span>
    </div>
  );
}

/** One ball's line: picture, name, how many balls are behind it, and its
 *  pocket, carry and strike. A thin sample is greyed, since it ranks nothing. */
function BallSummary({ ball }: { ball: BallPerformance }) {
  const thin = ball.firstBalls < RATE_LEADER_MIN_BALLS;
  const tone = thin ? "text-ink-tertiary" : "text-ink";
  return (
    <span className="flex w-full items-center gap-2 text-left text-sm">
      <span className="h-8 w-8 shrink-0">
        {ball.imageThumb || ball.brand ? (
          <CatalogBallImage src={ball.imageThumb} alt="" brand={ball.brand as Manufacturer} size="thumb" />
        ) : (
          <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
        )}
      </span>
      <span className="ml-1 min-w-0 flex-1">
        <span className="block truncate font-medium text-ink-strong">{ball.name}</span>
        <span className="block text-[11px] tabular-nums text-ink-tertiary">
          {ball.firstBalls} {ball.firstBalls === 1 ? "ball" : "balls"}
        </span>
      </span>
      {(
        [
          ["pocket", ball.pocketPct],
          ["carry", ball.carryPct],
          ["strike", ball.strikePct]
        ] as const
      ).map(([label, value]) => (
        <span
          key={label}
          className={`${RATE_COLUMN} font-semibold tabular-nums ${tone}`}
          aria-label={`${label} ${pct(value)}`}
        >
          {pct(value)}
        </span>
      ))}
    </span>
  );
}

/** A ball's detail: its rates by position in the night, and every leave it
 *  left. Shown open for every ball on the All balls sheet. */
function BallDetails({
  ball,
  onDrill
}: {
  ball: BallPerformance;
  /** Open the games behind one column, where there is somewhere to go. */
  onDrill?: (cell: BallGameCell) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-2">
      <table className="w-full text-[11px] tabular-nums">
        <thead>
          <tr className="text-ink-tertiary">
            <th className="text-left font-semibold">Game</th>
            {ball.byGame.map((c) => (
              <th key={c.gameNumber} className="text-right font-semibold">
                {onDrill && c.sessions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onDrill(c)}
                    aria-label={`Games behind ${ball.name}, game ${c.gameNumber}`}
                    className="underline decoration-dotted underline-offset-2"
                  >
                    {c.gameNumber}
                  </button>
                ) : (
                  c.gameNumber
                )}
              </th>
            ))}
            <th className="text-right font-semibold">All</th>
          </tr>
        </thead>
        <tbody className="text-ink-secondary">
          <MetricRow
            label="Pocket"
            cells={ball.byGame.map((c) => rateOf(c.pocket, c.firstBalls))}
            total={ball.pocketPct}
          />
          <MetricRow
            label="Carry"
            cells={ball.byGame.map((c) => rateOf(c.pocketStrikes, c.pocket))}
            total={ball.carryPct}
            onExplain={() => setNote((curr) => (curr === CARRY_NOTE ? null : CARRY_NOTE))}
          />
          <MetricRow
            label="Strike"
            cells={ball.byGame.map((c) => rateOf(c.strikes, c.firstBalls))}
            total={ball.strikePct}
          />
          <tr>
            <td className="text-left text-ink-tertiary">Balls</td>
            {ball.byGame.map((c) => (
              <td key={c.gameNumber} className="text-right text-ink-tertiary">
                {c.firstBalls}
              </td>
            ))}
            <td className="text-right text-ink-tertiary">{ball.firstBalls}</td>
          </tr>
        </tbody>
      </table>

      {note && <StatNote text={note} onDismiss={() => setNote(null)} />}

      {ball.leaves.length > 0 && (
        // Grouped the way the leave cards are, easiest first, and scrolled
        // rather than cut at four: every leave the ball left is part of the
        // answer.
        <div className="grid auto-cols-[calc((100%-1.125rem)/4)] grid-flow-col gap-1.5 overflow-x-auto overscroll-x-contain">
          {[...ball.leaves]
            .sort((a, b) => SPARE_GROUPS.indexOf(spareGroup(a.pins)) - SPARE_GROUPS.indexOf(spareGroup(b.pins)))
            .map((leave) => (
              <LeaveCountCell key={leave.pins.join("-")} leave={leave} />
            ))}
        </div>
      )}
    </div>
  );
}

/** What the numbers on a sheet are about: the Stats tab's filters and range,
 *  carried onto the sheet so a list read on its own still says which sessions
 *  it counts (ADR-128). */
function ScopeLine({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-secondary">
      <ListFilter size={12} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0">{label}</span>
    </p>
  );
}

/**
 * The top of a Stats sheet's list, pinned while the list scrolls under it.
 *
 * `FormSheet` pads its scroll area by 1rem, and a header stuck at `top-0` sits
 * below that padding: rows scrolling past showed through the gap above it, cut
 * off at the bar. So it starts 1rem up (`-mt-4`), sticks 1rem up (`-top-4`)
 * and fills that strip with its own background, edge to edge (`-mx-4`).
 */
function SheetHeader({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-b border-edge bg-surface px-4 pb-2 pt-4">
      {children}
    </div>
  );
}

/**
 * Every ball, each one open: its rates, its rates by game and its leaves.
 * Opened from the Balls card, scrolled to the ball that was tapped.
 */
function AllBallsSheet({
  balls,
  focusId,
  scopeLabel,
  onOpenGame,
  onClose
}: {
  balls: BallPerformance[];
  focusId: number | null;
  scopeLabel?: string;
  onOpenGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  onClose: () => void;
}) {
  const [drill, setDrill] = useState<{ ball: BallPerformance; cell: BallGameCell } | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (focusId === null) return;
    const el = listRef.current?.querySelector(`[data-ball="${focusId}"]`);
    if (el && "scrollIntoView" in el) el.scrollIntoView({ block: "start" });
  }, [focusId]);
  return (
    <FormSheet title="Balls" onClose={onClose} size="tall" active={drill === null}>
      <div>
        {/* The scope and the column names stay on screen, so a ball scrolled
            to still says what its numbers count and which column is which. */}
        <SheetHeader>
          <ScopeLine label={scopeLabel} />
          <div className="mt-3">
            <BallRateHeadings />
          </div>
        </SheetHeader>
        <div>
          <ul ref={listRef} className="divide-y divide-edge">
            {balls.map((b) => (
              <li key={b.ballId} data-ball={b.ballId} className="scroll-mt-24 py-3">
                <BallSummary ball={b} />
                <BallDetails ball={b} onDrill={onOpenGame && ((cell) => setDrill({ ball: b, cell }))} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {drill && onOpenGame && (
        <BallGameSessionsDialog
          open
          ballName={drill.ball.name}
          gameNumber={drill.cell.gameNumber}
          sessions={drill.cell.sessions}
          onSelect={(sessionId, gameId) => {
            // Leaving for a game: the sheet goes too, or it would still be
            // sitting over Stats, and over the game, when the bowler came back.
            onClose();
            onOpenGame(sessionId, gameId, drill.ball.ballId);
          }}
          onClose={() => setDrill(null)}
        />
      )}
    </FormSheet>
  );
}

/**
 * Every leave a ball followed, in its three groups, narrowed by the same
 * filters as the Spare lines screen (ADR-128) and labelled with the Stats
 * tab's own scope.
 */
function AllLeavesSheet({
  leaves,
  scopeLabel,
  covered,
  onOpen,
  onClose
}: {
  leaves: LeaveStats[];
  scopeLabel?: string;
  /** False while a sheet is open over this one. */
  covered: boolean;
  onOpen: (pins: LeaveStats["pins"]) => void;
  onClose: () => void;
}) {
  const spareFilters = useSpareFilters();
  const [pinsOpen, setPinsOpen] = useState(false);
  const [note, setNote] = useState(false);
  const lines = useLiveQuery(() => getSpareLinesAll());
  const lineFor = useMemo(() => {
    const byKey = new Map((lines ?? []).map((sl) => [leaveKey(sl.pins), sl]));
    return (pins: LeaveStats["pins"]) => byKey.get(leaveKey(pins));
  }, [lines]);
  const kept = leaves.filter(
    (l) =>
      matchesLeaveFilters(l.pins, lineFor(l.pins), spareFilters.filters) &&
      matchesPins(l.pins, spareFilters.pins, spareFilters.exact)
  );
  return (
    <FormSheet title="Leaves" onClose={onClose} size="tall" active={!covered && !pinsOpen}>
      <div className="space-y-4">
        {/* The scope and the filters stay on screen while the leaves scroll,
            so the list never loses what it is narrowed to. */}
        <SheetHeader>
          <ScopeLine label={scopeLabel} />
          <div className="mt-3">
            <SpareFilterBar
              state={spareFilters}
              label="Filter leaves"
              pinsOpen={pinsOpen}
              onPinsOpenChange={setPinsOpen}
            />
          </div>
        </SheetHeader>
        {note && <StatNote text={LEAVE_NOTE} onDismiss={() => setNote(false)} />}
        {kept.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-ink-secondary">No leaves fit these filters.</p>
            <button
              type="button"
              onClick={spareFilters.clear}
              className={`relative text-sm font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              Clear filters
            </button>
          </div>
        ) : (
          // Three groups, easiest first: makeables (ordinary leaves), washouts
          // (head pin standing with a gap behind it), and real splits.
          SPARE_GROUPS.map((group) => {
            const inGroup = sortByChances(kept.filter((l) => spareGroup(l.pins) === group));
            if (inGroup.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="mb-2">
                  <button type="button" onClick={() => setNote((v) => !v)} className={GROUP_HEADING}>
                    {SPARE_GROUP_LABEL[group]}
                  </button>
                </h3>
                <LeaveGrid leaves={inGroup} onOpen={onOpen} />
              </section>
            );
          })
        )}
      </div>
    </FormSheet>
  );
}

function MetricRow({
  label,
  cells,
  total,
  onExplain
}: {
  label: string;
  cells: Array<number | null>;
  total: number | null;
  /** Omitted where the label needs no explaining, and then it is not a
   *  control: a dotted underline that opens nothing is a broken promise. */
  onExplain?: () => void;
}) {
  return (
    <tr>
      <td className="text-left font-semibold text-ink">
        {onExplain ? (
          <button
            type="button"
            onClick={onExplain}
            className="underline decoration-dotted underline-offset-2"
          >
            {label}
          </button>
        ) : (
          label
        )}
      </td>
      {cells.map((value, i) => (
        <td key={i} className="text-right">
          {pct(value)}
        </td>
      ))}
      <td className="text-right font-semibold text-ink">{pct(total)}</td>
    </tr>
  );
}

function rateOf(made: number, opportunities: number): number | null {
  if (opportunities === 0) return null;
  return Math.round((made / opportunities) * 100);
}

/** Most-shot-at first, so the leaves with meaningful sample sizes lead. By
 *  chances rather than attempts, matching what the cells report. */
function sortByChances(leaves: LeaveStats[]): LeaveStats[] {
  return [...leaves].sort((a, b) => b.chances - a.chances);
}

/** Three to a row, not four. A tabular "100%" is 37px and "10/10" is 29px,
 *  which will not both fit a quarter of 390px however the type is sized: at
 *  four the count was silently clipping. Three leaves room for the widest
 *  pairing at full size, with the count hard left and the rate hard right in
 *  every cell. */
function LeaveGrid({
  leaves,
  onOpen
}: {
  leaves: LeaveStats[];
  onOpen: (pins: LeaveStats["pins"]) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {leaves.map((leave) => (
        <li key={leave.pins.join("-")}>
          <LeaveCell leave={leave} onOpen={() => onOpen(leave.pins)} />
        </li>
      ))}
    </ul>
  );
}

/** Per-ball leaves answer "what does this ball leave", not "do I make it": the
 *  conversion is about the spare game, and it is already on the leaves card. */
function LeaveCountCell({ leave }: { leave: LeaveStats }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-edge bg-surface px-1.5 py-2 text-center shadow-sm">
      <MiniPins standing={leave.pins} size="sm" />
      <span className="text-sm font-bold tabular-nums text-ink">
        {leave.attempts}
        <span className="text-[11px] font-semibold text-ink-secondary">
          {leave.attempts === 1 ? " time" : " times"}
        </span>
      </span>
      {/* The count alone rewards the ball thrown most: a share of this ball's
          own fresh-rack balls is the number that compares across the rows. */}
      {leave.sharePct !== null && (
        <span className="text-[11px] tabular-nums text-ink-tertiary">{leave.sharePct}%</span>
      )}
    </div>
  );
}

function LeaveCell({ leave, onOpen }: { leave: LeaveStats; onOpen: () => void }) {
  return (
    // px-1.5 rather than a square p-2: four of these fit a 390px row, and the
    // widest pairing ("10/10" beside "100%") overflowed the padding and put
    // the percent sign on the border.
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${formatLeave(leave.pins)}`}
      className="flex w-full flex-col items-center gap-1 rounded-xl border border-edge bg-surface px-1.5 py-2 text-center shadow-sm active:bg-surface-muted"
    >
      <MiniPins standing={leave.pins} size="sm" />
      {/* The pin diagram already names the leave: made over chances hard left,
          rate hard right. Both are tabular so the columns line up cell to cell
          however many digits each one happens to have. */}
      <div className="flex w-full items-baseline gap-1">
        <span className="min-w-0 flex-1 text-left text-[11px] tabular-nums text-ink-secondary">
          {leave.conversions}/{leave.chances}
        </span>
        <span
          className={`shrink-0 text-right text-sm font-bold tabular-nums ${
            leave.conversionPct !== null && leave.conversionPct >= 70
              ? "text-accent"
              : "text-ink"
          }`}
        >
          {leave.conversionPct !== null ? `${leave.conversionPct}%` : "-"}
        </span>
      </div>
    </button>
  );
}

function fmt(value: number | null): string {
  return value === null ? "-" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

/** Always one decimal, so a first ball of 9 reads as 9.0 and the tile does not
 *  jump between two and three characters as the average crosses a whole pin. */
function oneDp(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}
