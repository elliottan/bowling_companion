import { ArrowRight, BarChart3, ChevronRight, Lock, TrendingDown, TrendingUp } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { plural, t } from "@lingui/core/macro";
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
import { Button } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";
import {
  pinsPerBall,
  RATE_LEADER_MIN_BALLS,
  type BallGameCell,
  type BallPerformance,
  type BallPerformanceReport,
  type BowlingStats,
  type GameMetricPoint,
  type GameNumberMetricPoint,
  type LeaveStats,
  type SessionMetricPoint,
  type SessionTrendPoint
} from "../lib/stats";
import { BallGameSessionsDialog } from "./BallGameSessionsDialog";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { SessionTrendChart } from "./SessionTrendChart";
import { MetricTrendChart } from "./MetricTrendChart";
import { GameSlotSessionsDialog } from "./GameSlotSessionsDialog";
import type { Game } from "../types/bowling";
import { RECENT_SESSIONS, type RecentForm } from "../lib/statsRange";
import { GROUP_HEADING } from "./ui/typography";
import { ProBanner, ProBlur } from "./ui/ProLock";
import { useProAccess } from "../lib/useProAccess";
import { useProEntry } from "./ui/useProAction";
import type { LockedProAccess } from "../lib/pro";
import { byMostLeft, FREE_BALLS, previewSplit, standInBall } from "../lib/proPreview";
import { formatDate, formatFixed, formatNumber, formatPercent } from "../lib/format";

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

/** The metrics a bowler without Pro can plot (ADR-201): the score, and the two
 *  rates entered by hand at every frame, the pocket and the spare. Carry,
 *  strike and the first ball's other numbers are Pro, and first after these on
 *  the picker, each chip with a lock on it. */
const FREE_METRICS: ReadonlySet<MetricKey> = new Set(["average", "pocketPct", "sparePct"]);

/** What each metric is called and how it is drawn, for anything outside this
 *  file that plots one. */
export function metricSpec(metric: MetricKey) {
  return METRICS[metric];
}

/** What a metric counts, in one line. */
export function metricNote(metric: MetricKey): string {
  return METRIC_NOTE[metric];
}

// A tapped definition, for a number off the chart: the Spares heading.
const spareNote = () =>
  t({
    message: "Spare: makeable leaves converted, excludes splits and washouts.",
    comment: "Bowling terms: a makeable leave is a set of standing pins that can be converted to a spare; a split leaves gaps between pins; a washout is a leave with the head pin standing and a gap behind it"
  });

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
const leaveNote = () =>
  t({
    message: "Made over chances, then the rate. A leave off the last ball of the 10th has no spare to follow it, so it is not on this card.",
    comment: "Bowling terms: a leave is the set of pins left standing after the first ball; the 10th is the tenth and last frame"
  });

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
  /** Every stat by position in the night (game 1, game 2, ...), across the
   *  sessions in view. Given on the Stats tab, where it puts a By session / By
   *  game switch over the chart (ADR-139). */
  gameNumberMetrics?: GameNumberMetricPoint[];
  /** Narrow everything to one game number, picked off the by-game chart. */
  onOpenGameNumber?: (gameNumber: number) => void;
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
  gameNumberMetrics,
  onOpenGameNumber,
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
  // The by-game point whose nights are listed, by game number.
  const [slotOpen, setSlotOpen] = useState<number | null>(null);
  // The All balls sheet, and the ball it opened on.
  const [ballsOpen, setBallsOpen] = useState<{ focus: number | null } | null>(null);

  // Which stat the chart is plotting. Remembered, so leaving the tab and
  // coming back does not silently drop you back on the average.
  const [metricPick, setMetric] = useRememberedState<MetricKey>(`${memoryKey}:metric`, "average");
  // The chart and the First ball card's pocket are free; carry, strike and the
  // first ball's other numbers are Pro (ADR-201), so a metric remembered from
  // a time with Pro plots the average without it.
  const { locked: proLocked } = useProAccess();
  const metric: MetricKey = proLocked && !FREE_METRICS.has(metricPick) ? "average" : metricPick;
  const spec = METRICS[metric];
  // Night by night, or game 1 against game 2 (ADR-139). Only where there are
  // nights to slice both ways: a session sheet already plots its own games.
  const [chartByPick, setChartBy] = useRememberedState<ChartBy>(`${memoryKey}:chartBy`, "session");
  const canSlice = !gameMetrics && gameNumberMetrics !== undefined;
  const chartBy: ChartBy = canSlice ? chartByPick : "session";


  // One header for either chart: the picker, then one line saying what the
  // picked metric counts (ADR-127).
  const chartHeader = (
    <div className="mb-1">
      {canSlice && (
        <div className="mb-2">
          <SegmentedControl
            label={t`Chart by`}
            options={chartByOptions()}
            value={chartBy}
            onChange={setChartBy}
            dense
          />
        </div>
      )}
      <div className="flex items-center gap-1">
        <div
          role="group"
          aria-label={gameMetrics || chartBy === "game" ? t`Chart by game` : t`Chart by session`}
          className="scrollbar-none -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-none px-1 py-1"
        >
          {METRIC_KEYS.map((key) =>
            proLocked && !FREE_METRICS.has(key) ? (
              <LockedMetricChip key={key} label={METRICS[key].label} />
            ) : (
              <Chip
                key={key}
                selected={key === metric}
                onClick={() => setMetric(key)}
                className="shrink-0"
              >
                {METRICS[key].label}
              </Chip>
            )
          )}
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
        title={empty?.title ?? t`No stats yet`}
        description={empty?.description}
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
  const header = chartHeader;
  // Without Pro, the balls show the first as it is and the next one blurred,
  // and nothing after it (ADR-167). Every leave is free (ADR-201).
  const ballPreview = proLocked ? previewSplit(ranked, FREE_BALLS) : null;

  return (
    <div className="space-y-3">
      <Headline stats={stats} form={form} />

      <>
        {/* Inside a session the score line IS the average, so it answers to the
            picker like everything else. On the Stats tab there are no games and
            this branch never runs. */}
        {gameMetrics && gameMetrics.length > 0 && (
          metric === "average" ? (
            games &&
            games.length > 0 && (
              <ScoreTrendChart games={games} header={header} onOpenGame={onOpenGameId} />
            )
          ) : (
            <MetricTrendChart
              points={gameMetrics.map((p) => ({
                key: `g${p.gameId ?? p.gameNumber}`,
                axis: gameAxis(p.gameNumber),
                title: t`Game ${{ gameNumber: p.gameNumber }}`,
                detail: p.lanes.length ? lanesLabel(p.lanes) : undefined,
                value: spec.value(p.stats)
              }))}
              header={header}
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

        {/* By position in the night: every game 1 against every game 2. One
            chart for every metric, the average included, since a dot per game
            behind each slot would be hundreds of dots. */}
        {chartBy === "game" && gameNumberMetrics && gameNumberMetrics.length > 0 && (
          <MetricTrendChart
            points={gameNumberMetrics.map((p) => ({
              key: `n${p.gameNumber}`,
              axis: gameAxis(p.gameNumber),
              title: t`Game ${{ gameNumber: p.gameNumber }}`,
              detail: plural(p.games, { one: "# game", other: "# games" }),
              value: spec.value(p.stats)
            }))}
            header={header}
            overall={spec.value(stats)}
            format={spec.format}
            min={spec.min}
            max={spec.max}
            minSpan={spec.minSpan}
            labelAllUpTo={GAME_LABELS_UP_TO}
            // A point opens the nights behind it, each one a way into its game.
            // Without a way into a game, it narrows Stats to that game number.
            onOpen={
              onOpenGame
                ? (key) => setSlotOpen(Number(key.slice(1)))
                : onOpenGameNumber &&
                  ((key) => {
                    const n = Number(key.slice(1));
                    if (Number.isInteger(n) && n > 0) onOpenGameNumber(n);
                  })
            }
          />
        )}

        {slotOpen !== null && onOpenGame && (
          <GameSlotSessionsDialog
            gameNumber={slotOpen}
            sessions={gameNumberMetrics?.find((p) => p.gameNumber === slotOpen)?.sessions ?? []}
            onSelect={onOpenGame}
            onClose={() => setSlotOpen(null)}
          />
        )}

        {/* Per-game and per-session are alternatives, never both: a session
            sheet plots its games, the Stats tab plots its nights. */}
        {!gameMetrics && chartBy === "session" &&
          (metric === "average"
          ? sessionTrend &&
            sessionTrend.length > 0 && (
              <SessionTrendChart
                sessions={sessionTrend}
                header={header}
                overall={stats.averageScore}
                onOpenSession={onOpenSession}
              />
            )
          : sessionMetrics &&
            sessionMetrics.length > 0 && (
              <MetricTrendChart
                points={sessionMetrics.map((p) => ({
                  key: `s${p.sessionId ?? ""}:${p.date}`,
                  axis: shortDate(p.date),
                  title: p.alley,
                  detail: [p.event, plural(p.games, { one: "# game", other: "# games" }), p.oilPattern]
                    .filter(Boolean)
                    .join(" · "),
                  value: spec.value(p.stats)
                }))}
                header={header}
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
      </>

      <FirstBallCard stats={stats} />

      {(stats.sparePct !== null || convertible.length > 0) && (
        <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2>
              <button type="button" onClick={() => toggleNote(spareNote())} className={GROUP_HEADING}>
                {t({ message: "Spares", comment: "Bowling term: all remaining pins knocked down with the second ball of a frame" })}
              </button>
            </h2>
          </div>
          {/* Of the makeables, since that is what the rate counts: splits and
              washouts are left out of it (spareNote). */}
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-ink">{pct(stats.sparePct)}</span>
            <span className="text-sm text-ink-secondary">{t({ message: "of makeables made", comment: "Bowling term: a makeable leave is a set of standing pins that can be converted to a spare" })}</span>
          </p>
          {note === spareNote() && (
            <div className="mt-2">
              <StatNote text={spareNote()} onDismiss={() => setNote(null)} />
            </div>
          )}
          {leftMost.length > 0 && (
            // Two rows of three, and every other leave under View all: a
            // scroller inside the scrolling screen was a second scroll to
            // find and to fight (ADR-196). Every leave is free (ADR-201).
            <div className="mt-3">
              <LeaveGrid leaves={leftMost} onOpen={setOpenLeave} label={t({ message: "Leaves left most", comment: "Bowling term: a leave is the set of pins left standing after the first ball" })} />
            </div>
          )}
          {/* How many there are, so the bowler knows the size of what is
              behind the tap. */}
          {convertible.length > 0 && (
            <ViewAll count={convertible.length} noun="leaves" onClick={() => setAllLeavesOpen(true)} />
          )}
        </section>
      )}

      {ranked.length > 0 && (
          <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className={GROUP_HEADING}>{t`Balls`}</h2>
            </div>
            {ballPreview ? (
              // Without Pro: the best ball in full, and the next one blurred
              // (ADR-167). The best ball opens the sheet on itself (ADR-174).
              <div className="scrollbar-none mt-1 overflow-x-auto overscroll-x-none">
                <div className="min-w-fit">
                  <BallRateHeadings />
                  <ul aria-label={t`Balls`} className="divide-y divide-edge">
                    {ballPreview.shown.map((b) => (
                      <li key={b.ballId}>
                        <button
                          type="button"
                          onClick={() => setBallsOpen({ focus: b.ballId })}
                          aria-label={t`Open ${{ name: b.name }}`}
                          className="group flex w-full py-2 active:bg-surface-muted"
                        >
                          <BallSummary ball={b} />
                        </button>
                      </li>
                    ))}
                    {ballPreview.blurred && (
                      <li>
                        <ProBlur what={t`How each of your balls strikes, carries and spares`}>
                          <div className="flex py-2">
                            <BallSummary ball={standInBall(ballPreview.blurred)} />
                          </div>
                        </ProBlur>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
            // The best six, and every ball under View all, like the leaves
            // above (ADR-196). The columns fit a phone (ADR-144); on one
            // narrower still, the rows scroll sideways together with the
            // ball's name pinned at the left (ADR-139).
            <div
              role="region"
              aria-label={t`Ball columns`}
              className="scrollbar-none mt-1 overflow-x-auto overscroll-x-none"
            >
              <div className="min-w-fit">
                <BallRateHeadings />
                <ul className="divide-y divide-edge">
                  {ranked.slice(0, CARD_BALLS).map((b) => (
                    <li key={b.ballId}>
                      <button
                        type="button"
                        onClick={() => setBallsOpen({ focus: b.ballId })}
                        aria-label={t`Open ${{ name: b.name }}`}
                        className="group flex w-full py-2 active:bg-surface-muted"
                      >
                        <BallSummary ball={b} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            )}
            <ViewAll count={ranked.length} noun="balls" onClick={() => setBallsOpen({ focus: null })} />
          </section>
      )}

      {/* Said once for the screen, under the bowler's own numbers rather than
          over them; each card above carries only a small mark. */}
      <ProBanner what={t`Get a deeper analysis of your stats.`} />

      {/* Portalled to the body: on the session sheet the stats sit inside a
          panel that slides on a transform, and a transformed ancestor makes
          `fixed` resolve against it, not the viewport. */}
      {ballsOpen &&
        createPortal(
          <AllBallsSheet
            locked={proLocked}
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
  // The average and its three companions share one row, so the card that
  // leads the screen does not take a third of it.
  return (
    <section className="rounded-xl border border-edge bg-surface px-3 py-2.5 shadow-sm">
      {/* Wraps rather than squeezing: the average is the one number that
          must never be cut, and at a large text size on a narrow phone the
          companions take the next line, still flush right, instead of
          shrinking the average's column out from under it. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="flex-1">
          <h2 className={GROUP_HEADING}>{t({ message: "Average", comment: "A bowling average: the score per game" })}</h2>
          {/* In the accent: it is the answer the screen leads with. */}
          <p className="mt-0.5 text-4xl font-bold leading-none tabular-nums text-accent">
            {fmt(stats.averageScore)}
          </p>
        </div>
        <Companions
          className="ml-auto shrink-0 gap-4"
          items={[
            [t({ message: "High", comment: "The highest game score" }), fmt(stats.highGame)],
            [t({ message: "Low", comment: "The lowest game score" }), fmt(stats.lowGame)],
            [t`Games`, formatNumber(stats.completedGames)]
          ]}
        />
      </div>
      {form && <FormLine form={form} />}
    </section>
  );
}

/** Recent form, said as a sentence. Never in red: a slower month is something
 *  to know, not something to be told off for. */
function FormLine({ form }: { form: RecentForm }) {
  const { average, difference } = form;
  const Icon = difference > 0 ? TrendingUp : difference < 0 ? TrendingDown : null;
  const gap = formatNumber(Math.abs(difference));
  const against =
    difference === 0
      ? t`level with your average`
      : difference > 0
        ? t`${{ gap }} above your average`
        : t`${{ gap }} under your average`;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-secondary">
      {Icon && (
        <Icon
          size={14}
          aria-hidden="true"
          className={`mt-px shrink-0 ${difference > 0 ? "text-accent" : "text-ink-tertiary"}`}
        />
      )}
      <span>
        <span className={`font-semibold tabular-nums ${difference > 0 ? "text-accent" : "text-ink"}`}>
          {average}
        </span>{" "}
        {t`over your last ${{ sessions: RECENT_SESSIONS }} sessions, ${{ against }}`}
      </span>
    </p>
  );
}

/**
 * A card's smaller numbers: each one centred over its label, in a row. The
 * headline's high, low and games and the First ball card's three use the same
 * one, so every card on the screen reads the same way, a heading, its one
 * large answer, and these under or beside it (ADR-196). Right-aligned, a short
 * label ("Low") sat off under the end of a wider number.
 */
function Companions({
  items,
  className = ""
}: {
  items: ReadonlyArray<readonly [label: string, value: string]>;
  className?: string;
}) {
  return (
    <dl className={`grid grid-cols-3 text-center ${className}`}>
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-xs text-ink-secondary">{label}</dt>
          <dd className="text-base font-bold leading-tight tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Pocket, carry and strike as the chain they are: of the first balls, these hit
 * the pocket, of those this many carried, and that is most of the strikes. As
 * three separate tiles the relationship between them was lost, and it is the
 * thing a bowler most needs from them: whether a low strike rate is a getting-
 * there problem or a carrying problem. The arrows say "leads to", not "equals":
 * a Brooklyn strike is a strike and not a pocket hit.
 *
 * Under the chain, the card's other three in one even row (ADR-196): pins a
 * ball, strike after a strike, and the longest run. They used to be scattered,
 * one in the heading's corner and two pushed to either end of a footer line,
 * three sizes and three alignments for numbers of the same weight.
 *
 * Without Pro the pocket is the card's answer, since the bowler enters it at
 * every frame, and the rest sits blurred under one lock (ADR-201).
 */
function FirstBallCard({
  stats
}: {
  /** Only what the card reads. */
  stats: Pick<
    BowlingStats,
    "pocketPct" | "carryPct" | "strikePct" | "firstBallAverage" | "strikeOnStrikePct" | "bestStreak"
  >;
}) {
  const { locked } = useProAccess();
  if (locked) return <LockedFirstBallCard pocketPct={stats.pocketPct} />;
  const links: Array<[string, string, boolean]> = [
    [t({ message: "Pocket", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" }), pct(stats.pocketPct), false],
    [t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" }), pct(stats.carryPct), false],
    [t({ message: "Strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" }), pct(stats.strikePct), true]
  ];
  return (
    <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <h2 className={GROUP_HEADING}>{t({ message: "First ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" })}</h2>
      {/* Capped as a table is (`type-cap-dense`): three percentages and two
          arrows share one row, and at the full largest size "100 %" (with the
          space Spanish puts before the sign) pushed the third past the card. */}
      <dl className="type-cap-dense mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-center">
        {links.map(([label, value, lead], i) => (
          <Fragment key={label}>
            {i > 0 && <ArrowRight size={14} aria-hidden="true" className="text-ink-tertiary" />}
            <div className="flex flex-col-reverse">
              <dt className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{label}</dt>
              <dd className={`text-2xl font-bold tabular-nums ${lead ? "text-accent" : "text-ink"}`}>{value}</dd>
            </div>
          </Fragment>
        ))}
      </dl>
      <Companions
        className="mt-3 border-t border-edge pt-2.5"
        items={[
          [t({ message: "1st ball avg", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins; avg is short for average" }), oneDp(stats.firstBallAverage)],
          [t({ message: "Strike on strike", comment: "Bowling term: a strike on the ball right after a strike" }), pct(stats.strikeOnStrikePct)],
          [t({ message: "Strikes in a row", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" }), fmt(stats.bestStreak)]
        ]}
      />
    </section>
  );
}

/**
 * A chart metric that is Pro, on the picker without it (ADR-201): the chip as
 * it is, with a lock beside its name, and a tap goes to Pro rather than
 * plotting. Shown rather than left off, so the bowler sees what Pro would
 * chart.
 */
function LockedMetricChip({ label }: { label: string }) {
  const access = useProAccess();
  if (!access.locked) return null;
  return <LockedChip access={access} label={label} />;
}

function LockedChip({ access, label }: { access: LockedProAccess; label: string }) {
  const entry = useProEntry(access);
  return (
    <>
      <Chip
        selected={false}
        onClick={entry.start}
        aria-label={t`${{ label }}. ${{ action: entry.label }}`}
        className="shrink-0 gap-1 text-ink-secondary"
      >
        {label}
        <Lock size={11} aria-hidden="true" className="text-ink-tertiary" />
      </Chip>
      {entry.dialog}
    </>
  );
}

/** The First ball card without Pro: the pocket in full, and carry, strike and
 *  the three smaller numbers blurred under one lock. Stand-in figures under the
 *  blur, never the bowler's own, since blurred text is still in the page
 *  (ADR-190). */
function LockedFirstBallCard({ pocketPct }: { pocketPct: number | null }) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <h2 className={GROUP_HEADING}>{t({ message: "First ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" })}</h2>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-ink">{pct(pocketPct)}</span>
        <span className="text-sm text-ink-secondary">{t({ message: "pocket hits", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" })}</span>
      </p>
      <ProBlur what={t`Carry, strike and the first ball's other numbers`} className="mt-3">
        <dl className="grid grid-cols-[1fr_auto_1fr] items-center text-center">
          <div className="flex flex-col-reverse">
            <dt className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" })}</dt>
            <dd className="text-2xl font-bold tabular-nums text-ink">63%</dd>
          </div>
          <ArrowRight size={14} aria-hidden="true" className="text-ink-tertiary" />
          <div className="flex flex-col-reverse">
            <dt className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{t({ message: "Strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" })}</dt>
            <dd className="text-2xl font-bold tabular-nums text-accent">48%</dd>
          </div>
        </dl>
        <Companions
          className="mt-3 border-t border-edge pt-2.5"
          items={[
            [t({ message: "1st ball avg", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins; avg is short for average" }), "8.8"],
            [t({ message: "Strike on strike", comment: "Bowling term: a strike on the ball right after a strike" }), "45%"],
            [t({ message: "Strikes in a row", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" }), "6"]
          ]}
        />
      </ProBlur>
    </section>
  );
}

type ChartBy = "session" | "game";

const chartByOptions = (): ReadonlyArray<{ value: ChartBy; label: string }> => [
  { value: "session", label: t`By session` },
  { value: "game", label: t`By game` }
];

/** A game's short label on a chart axis: G1, G2. */
function gameAxis(gameNumber: number): string {
  return t({ message: `G${gameNumber}`, comment: "Short axis label for a game number on a chart, like G1" });
}

/** A session's date on a chart axis, month and day only. */
function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return formatDate(new Date(y, m - 1, d), { month: "2-digit", day: "2-digit" });
}

/** The lanes a game was bowled on: "Lane 3", "Lanes 3, 4". */
function lanesLabel(lanes: readonly string[]): string {
  const list = lanes.join(", ");
  return plural(lanes.length, { one: `Lane ${list}`, other: `Lanes ${list}` });
}

/** Game slots on the by-game chart that each get a label. "G12" is short, so a
 *  long day of league and practice still names every slot (ADR-145). */
export const GAME_LABELS_UP_TO = 12;

/** Leaves on the Spares card, two rows of three; every one is under All leaves. */
const CARD_LEAVES = 6;

/** Balls on the Balls card; every one is under All balls. */
const CARD_BALLS = 6;

/**
 * The way from a card to its whole list: a glass pill the card's width, at its
 * foot, where the thumb is once the card has been read (ADR-196). It used to
 * be a line of accent text in the card's top corner, "View all 78 leaves",
 * which read as a link in a heading and was a small target. The count stays,
 * so the bowler knows the size of what is behind it; the noun is for a screen
 * reader, since the card's heading already says what is counted.
 */
function ViewAll({ count, noun, onClick }: { count: number; noun: "leaves" | "balls"; onClick: () => void }) {
  const spoken =
    noun === "leaves"
      ? plural(count, {
          one: "View all # leave",
          other: "View all # leaves"
        })
      : plural(count, {
          one: "View all # ball",
          other: "View all # balls"
        });
  return (
    <Button variant="glass" onClick={onClick} className="mt-3 w-full" aria-label={spoken}>
      {t`View all ${{ count }}`}
      <ChevronRight size={16} aria-hidden="true" className="-mr-1" />
    </Button>
  )
}

/** The leaves left most, of every shape, most often first (ADR-129), however
 *  few times each was left (ADR-139): a single session's card is still worth
 *  reading, and a leave left once sorts to the bottom on its own. */
function mostLeft(leaves: LeaveStats[]): LeaveStats[] {
  return [...leaves].sort(byMostLeft).slice(0, CARD_LEAVES);
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

/** Strike on strike where there is no room for the words: X is the strike's
 *  mark on a scoresheet, so a bowler reads it at a glance. */
const strikeOnStrikeShort = () =>
  t({ message: "X-on-X", comment: "Bowling term: a strike on the ball right after a strike. Short form for a column heading: X is the strike mark on a scoresheet" });

/** Every ball column's width: 44px, the width of "POCKET", the widest
 *  one-word heading, which at 36px ran into "CARRY" beside it. Scaled with
 *  the row's text, so a number grows into room of its own; the row scrolls
 *  sideways under the pinned name where the five no longer fit. */
const BALL_COLUMN_WIDTH = "w-[calc(2.75rem*var(--type-scale))]";

/** A ball's columns, in order, shared by the heading row and every ball so
 *  each number sits under the word that names it. Strike leads the three
 *  rates it ends; the first ball average and strike on strike follow. All five
 *  fit beside the name on a 390px phone at the standard size (ADR-144). */
const BALL_COLUMNS: ReadonlyArray<{
  key: string;
  /** The column heading. */
  label: string;
  /** What a screen reader hears with the number. */
  spoken: string;
  width: string;
  value: (b: BallPerformance) => string;
}> = [
  {
    key: "pocket",
    get label() {
      return t({ message: "Pocket", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" });
    },
    get spoken() {
      return t({ message: "pocket", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance. Lower case: read aloud before a number" });
    },
    width: BALL_COLUMN_WIDTH,
    value: (b) => pct(b.pocketPct)
  },
  {
    key: "carry",
    get label() {
      return t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" });
    },
    get spoken() {
      return t({ message: "carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down. Lower case: read aloud before a number" });
    },
    width: BALL_COLUMN_WIDTH,
    value: (b) => pct(b.carryPct)
  },
  {
    key: "strike",
    get label() {
      return t({ message: "Strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" });
    },
    get spoken() {
      return t({ message: "strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame. Lower case: read aloud before a number" });
    },
    width: BALL_COLUMN_WIDTH,
    value: (b) => pct(b.strikePct)
  },
  {
    key: "first ball",
    get label() {
      return t({ message: "1st ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" });
    },
    get spoken() {
      return t({ message: "first ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins. Lower case: read aloud before a number" });
    },
    width: BALL_COLUMN_WIDTH,
    value: (b) => oneDp(b.firstBallAverage)
  },
  // The key is what a screen reader hears with each number; the heading is
  // the short form, which fits one line where the words took three.
  {
    key: "strike on strike",
    get label() {
      return strikeOnStrikeShort();
    },
    get spoken() {
      return t({ message: "strike on strike", comment: "Bowling term: a strike on the ball right after a strike. Lower case: read aloud before a number" });
    },
    width: BALL_COLUMN_WIDTH,
    value: (b) => pct(b.strikeOnStrikePct)
  }
];

/** The ball's picture and name, taking whatever the columns leave. Below about
 *  six rem, on a phone narrower than any in use, the columns scroll under it
 *  instead, so it is pinned at the left and opaque: a number never loses the
 *  ball it belongs to, and it takes the row's pressed colour, or a pressed row
 *  showed the cell as a dark block. */
const BALL_NAME_CELL =
  "sticky left-0 z-[1] flex min-w-24 flex-1 items-center gap-1.5 bg-surface pr-1 group-active:bg-surface-muted";

/** The gap between columns, the heading row's and every ball's alike. Each
 *  column is one fixed width and its number is centred in it, so the columns
 *  sit at an even step whatever they hold: right-aligned, a short figure
 *  ("9.0") opened a wider gap before it than a long one ("52%"), and the
 *  stacked "1st ball" heading leaned off its number. */
const BALL_ROW = "type-cap-dense flex gap-1";

/** A one-word heading ("X-on-X") stays on one line: at the column's edge it
 *  broke at its hyphen and read as "X-ON-" over "X". Two words ("1st ball")
 *  still stack. */
const NO_BREAK = (label: string) => (label.includes(" ") ? "" : "whitespace-nowrap");

/** The headings over the columns, spelled out: as single letters they had to
 *  be decoded before the row said anything. */
function BallRateHeadings() {
  return (
    <div
      className={`${BALL_ROW} sticky top-0 z-[2] items-end bg-surface pb-1 font-semibold uppercase leading-tight text-ink-tertiary`}
      aria-hidden="true"
    >
      <span className={`${BALL_NAME_CELL} self-stretch`} />
      {BALL_COLUMNS.map((c) => (
        // The heading holds its base size, while the columns widen with the
        // bowler's text size: a grown heading overran into its neighbours.
        <span key={c.key} className={`${c.width} shrink-0 text-center ${NO_BREAK(c.label)}`}>
          <span className="type-cap-fixed text-caption-2">{c.label}</span>
        </span>
      ))}
    </div>
  );
}

/** One ball's line: picture, name, how many balls are behind it, and its
 *  columns. A thin sample is greyed, since it ranks nothing.
 *
 *  `labelled` names each column over its own number, for a list long enough
 *  that a heading row at the top has scrolled away: the All balls sheet. A
 *  heading pinned over the list was tried there and read as a bar cutting the
 *  balls in half (ADR-130). Labelled, the line scrolls sideways on its own;
 *  on the card the rows share one scroller so the columns stay aligned. */
function BallSummary({ ball, labelled = false }: { ball: BallPerformance; labelled?: boolean }) {
  const thin = ball.firstBalls < RATE_LEADER_MIN_BALLS;
  const tone = thin ? "text-ink-tertiary" : "text-ink";
  const line = (
    <span className={`${BALL_ROW} w-full items-end text-left text-footnote`}>
      <span className={`${BALL_NAME_CELL} self-center`}>
        <span className="h-7 w-7 shrink-0">
          {ball.imageThumb || ball.brand ? (
            <CatalogBallImage src={ball.imageThumb} alt="" brand={ball.brand as Manufacturer} size="thumb" />
          ) : (
            <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          {/* Two lines before it gives up, so a long name is read, not cut. */}
          <span className="line-clamp-2 break-words font-medium leading-tight text-ink-strong">
            {ball.name}
          </span>
          <span className="block text-caption-2 tabular-nums text-ink-tertiary">
            {t({ message: plural(ball.firstBalls, { one: "# ball", other: "# balls" }), context: "balls thrown", comment: "A count of shots thrown (first balls), not of bowling balls owned" })}
          </span>
        </span>
      </span>
      {BALL_COLUMNS.map((c) => (
        <span
          key={c.key}
          className={`${c.width} shrink-0 text-center font-semibold tabular-nums ${tone} ${
            labelled ? "" : "self-center"
          }`}
          aria-label={t`${{ column: c.spoken }} ${{ value: c.value(ball) }}`}
        >
          {labelled && (
            <span
              className={`type-cap-fixed block text-caption-2 font-semibold uppercase leading-tight text-ink-tertiary ${NO_BREAK(c.label)}`}
              aria-hidden="true"
            >
              {c.label}
            </span>
          )}
          {c.value(ball)}
        </span>
      ))}
    </span>
  );
  if (!labelled) return line;
  return (
    <div
      role="region"
      aria-label={t`${{ name: ball.name }} columns`}
      className="scrollbar-none overflow-x-auto overscroll-x-none"
    >
      {line}
    </div>
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
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-2">
      {/* Wider than the sheet once a ball has been thrown in many game slots:
          it scrolls sideways with the row names pinned (ADR-139). Every game
          is one fixed column with its figures centred, and the row names take
          whatever is left, so the games sit at an even step. Sized by their
          contents, each column took its widest figure and a share of the
          spare room, and "1 2 3 4" landed at uneven gaps. */}
      <div
        role="region"
        aria-label={t`${{ name: ball.name }} by game`}
        className="scrollbar-none overflow-x-auto overscroll-x-none"
      >
        <table className="min-w-full whitespace-nowrap text-caption-2 tabular-nums">
          <thead>
            <tr className="text-ink-tertiary">
              <th className={`${ROW_NAME_CELL} text-left font-semibold`}>{t`By game`}</th>
              {ball.byGame.map((c) => (
                <th key={c.gameNumber} className={`${GAME_CELL} font-semibold`}>
                  {onDrill && c.sessions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onDrill(c)}
                      aria-label={t`Games behind ${{ name: ball.name }}, game ${{ gameNumber: c.gameNumber }}`}
                      className="underline decoration-dotted underline-offset-2"
                    >
                      {c.gameNumber}
                    </button>
                  ) : (
                    c.gameNumber
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-ink-secondary">
            <MetricRow label={t({ message: "Pocket", comment: "Bowling term: the pocket is the spot between the head pin and the pin beside it where a ball hits for the best strike chance" })} cells={ball.byGame.map((c) => rateOf(c.pocket, c.firstBalls))} />
            <MetricRow label={t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket knocked all the pins down" })} cells={ball.byGame.map((c) => rateOf(c.pocketStrikes, c.pocket))} />
            <MetricRow label={t({ message: "Strike", comment: "Bowling term: all ten pins knocked down with the first ball of a frame" })} cells={ball.byGame.map((c) => rateOf(c.strikes, c.firstBalls))} />
            <MetricRow
              label={t({ message: "1st ball", comment: "Bowling term: the first ball of a frame, thrown at a full rack of ten pins" })}
              cells={ball.byGame.map((c) => pinsPerBall(c.firstBallPins, c.firstBalls))}
              format={oneDp}
            />
            <MetricRow
              label={strikeOnStrikeShort()}
              spoken={t({ message: "Strike on strike", comment: "Bowling term: a strike on the ball right after a strike" })}
              cells={ball.byGame.map((c) => rateOf(c.followUps, c.followUpOpps))}
            />
            <tr>
              <td className={`${ROW_NAME_CELL} text-left text-ink-tertiary`}>{t`Balls`}</td>
              {ball.byGame.map((c) => (
                <td key={c.gameNumber} className={`${GAME_CELL} text-ink-tertiary`}>
                  {c.firstBalls}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {ball.leaves.length > 0 && (
        // Grouped the way the leave cards are, easiest first, and scrolled
        // rather than cut at four: every leave the ball left is part of the
        // answer.
        <div className="scrollbar-none grid auto-cols-[calc((100%-1.125rem)/4)] grid-flow-col gap-1.5 overflow-x-auto overscroll-x-none">
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

/**
 * The top of a Stats sheet's list, pinned while the list scrolls under it.
 *
 * `FormSheet` floats its bar over the scroll area and pads the area by the
 * bar's height and 1rem (`--sheet-bar-h`, ADR-168), and a sticky row stops at
 * the edge of that padding, not at the top of the area. A header stuck there
 * would let rows show through the bar above it, so it starts that far up
 * (`-mt-`), sticks that far up (`-top-`), and fills the strip with its own
 * background, edge to edge (`-mx-4`): the list passes under the bar and this
 * header as one opaque band.
 */
function SheetHeader({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -top-[calc(var(--sheet-bar-h,0px)+1rem)] z-10 -mx-4 -mt-[calc(var(--sheet-bar-h,0px)+1rem)] border-b border-edge bg-surface px-4 pb-2 pt-[calc(var(--sheet-bar-h,0px)+1rem)]">
      {children}
    </div>
  );
}

/** Scroll the nearest scroller holding `el` so `el` sits where the list
 *  starts, clear of the bar floating over the scroller's top padding. */
function scrollUnderBar(el: HTMLElement) {
  // The sheet's body, found by its class as the pattern sheet finds its own.
  const scroller = el.parentElement?.closest<HTMLElement>(".overflow-y-auto");
  if (!scroller) return;
  const clear = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  const below = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += below - clear;
}

/**
 * Every ball, each one open: its rates, its rates by game and its leaves.
 * Opened from the Balls card, scrolled to the ball that was tapped.
 */
function AllBallsSheet({
  locked,
  balls,
  focusId,
  scopeLabel,
  onOpenGame,
  onClose
}: {
  /** Without Pro: the ball the card shows, open, then the next one blurred
   *  and nothing after it, as on the card (ADR-174). */
  locked: boolean;
  balls: BallPerformance[];
  focusId: number | null;
  scopeLabel?: string;
  onOpenGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  onClose: () => void;
}) {
  const [drill, setDrill] = useState<{ ball: BallPerformance; cell: BallGameCell } | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const { shown, blurred } = locked ? previewSplit(balls, FREE_BALLS) : { shown: balls, blurred: undefined };
  // Open on the ball that was tapped, its name just under the sheet's bar.
  // `scrollIntoView` put it at the very top of the scroll area, where the bar
  // floats over it (ADR-168), and it can scroll the document as well, which is
  // how the viewport bug starts (docs/VIEWPORT-BUG.md). So the sheet's own list
  // is scrolled, by the ball's distance from where the list starts: the
  // scroller's top padding is the bar's height and a little more.
  useEffect(() => {
    if (focusId === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-ball="${focusId}"]`);
    if (el) scrollUnderBar(el);
  }, [focusId]);
  return (
    // The scope rides in the bar, under the title, so it never scrolls away
    // and takes none of the list's room (ADR-130).
    <FormSheet title={t`Balls`} subtitle={scopeLabel} onClose={onClose} size="tall" active={drill === null}>
      <div>
        <div>
          <ul ref={listRef} className="-mt-3 divide-y divide-edge">
            {shown.map((b) => (
              <li key={b.ballId} data-ball={b.ballId} className="py-3">
                <BallSummary ball={b} labelled />
                <BallDetails ball={b} onDrill={onOpenGame && ((cell) => setDrill({ ball: b, cell }))} />
              </li>
            ))}
            {blurred && (
              <li className="py-3">
                <ProBlur what={t`How each of your balls strikes, carries and spares`}>
                  <BallSummary ball={standInBall(blurred)} labelled />
                </ProBlur>
              </li>
            )}
          </ul>
        </div>
      </div>
      {drill && onOpenGame && (
        <BallGameSessionsDialog
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
    <FormSheet
      title={t({ message: "Leaves", comment: "Bowling term: the pins left standing after the first ball of a frame" })}
      subtitle={scopeLabel}
      onClose={onClose}
      size="tall"
      active={!covered && !pinsOpen}
    >
      <div className="space-y-4">
        {/* The scope is in the bar; the filters stay pinned under it while the
            leaves scroll, so the list never loses what it is narrowed to. */}
        <SheetHeader>
          <SpareFilterBar
            state={spareFilters}
            label={t({ message: "Filter leaves", comment: "Bowling term: a leave is the set of pins left standing after the first ball" })}
            pinsOpen={pinsOpen}
            onPinsOpenChange={setPinsOpen}
          />
        </SheetHeader>
        {note && <StatNote text={leaveNote()} onDismiss={() => setNote(false)} />}
        {kept.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-ink-secondary">{t({ message: "No leaves fit these filters.", comment: "Bowling term: a leave is the set of pins left standing after the first ball" })}</p>
            <button
              type="button"
              onClick={spareFilters.clear}
              className={`relative text-sm font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              {t`Clear filters`}
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

/** A ball table's row names, pinned while the game columns scroll. Opaque in
 *  the detail box's own colour, since the columns pass behind it. */
const ROW_NAME_CELL = "sticky left-0 z-[1] bg-surface-muted pr-2";

/** One game's column in a ball's by-game table: a fixed width that holds
 *  "100%" with room either side, its figures centred. A table hands its spare
 *  width to the columns with no width of their own, so the row names take it
 *  and every game column stays this wide. Scaled with the text, or "100%"
 *  ran into the next game's figure at a large size. */
const GAME_CELL = "w-[calc(2.5rem*var(--type-scale))] min-w-[calc(2.5rem*var(--type-scale))] text-center";

function MetricRow({
  label,
  spoken,
  cells,
  format = pct
}: {
  label: string;
  /** What a screen reader hears where `label` is a short form ("X-on-X"). */
  spoken?: string;
  cells: Array<number | null>;
  /** How a cell reads; a rate unless said otherwise. */
  format?: (value: number | null) => string;
}) {
  // No All column: the ball's line above the table carries every total, and
  // a second copy cost the table its last column on a phone.
  return (
    <tr>
      <td className={`${ROW_NAME_CELL} text-left font-semibold text-ink`}>
        {spoken ? (
          <>
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">{spoken}</span>
          </>
        ) : (
          label
        )}
      </td>
      {cells.map((value, i) => (
        <td key={i} className={GAME_CELL}>
          {format(value)}
        </td>
      ))}
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
  onOpen,
  label
}: {
  leaves: LeaveStats[];
  onOpen: (pins: LeaveStats["pins"]) => void;
  label?: string;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-3 gap-1.5">
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
        {formatNumber(leave.attempts)}
        <span className="text-caption-2 font-semibold text-ink-secondary">
          {" "}
          {plural(leave.attempts, { one: "time", other: "times" })}
        </span>
      </span>
      {/* The count alone rewards the ball thrown most: a share of this ball's
          own fresh-rack balls is the number that compares across the rows. */}
      {leave.sharePct !== null && (
        <span className="text-caption-2 tabular-nums text-ink-tertiary">{formatPercent(leave.sharePct)}</span>
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
      aria-label={t`Open ${{ leave: formatLeave(leave.pins) }}`}
      className="flex w-full flex-col items-center gap-1 rounded-xl border border-edge bg-surface px-1.5 py-2 text-center shadow-sm active:bg-surface-muted"
    >
      <MiniPins standing={leave.pins} size="sm" />
      {/* The pin diagram already names the leave: made over chances hard left,
          rate hard right. Both are tabular so the columns line up cell to cell
          however many digits each one happens to have. At a large text size
          the two no longer fit side by side, and the rate wraps under. */}
      <div className="flex w-full flex-wrap items-baseline justify-between gap-x-1">
        <span className="whitespace-nowrap text-left text-caption-2 tabular-nums text-ink-secondary">
          {formatNumber(leave.conversions)}/{formatNumber(leave.chances)}
        </span>
        <span
          className={`ml-auto whitespace-nowrap text-right text-sm font-bold tabular-nums ${
            leave.conversionPct !== null && leave.conversionPct >= 70
              ? "text-accent"
              : "text-ink"
          }`}
        >
          {leave.conversionPct !== null ? formatPercent(leave.conversionPct) : "-"}
        </span>
      </div>
    </button>
  );
}

function fmt(value: number | null): string {
  return value === null ? "-" : formatNumber(value);
}

function pct(value: number | null): string {
  return value === null ? "-" : formatPercent(value);
}

/** Always one decimal, so a first ball of 9 reads as 9.0 and the tile does not
 *  jump between two and three characters as the average crosses a whole pin. */
function oneDp(value: number | null): string {
  return value === null ? "-" : formatFixed(value, 1);
}
