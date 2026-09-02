import { BarChart3, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useRememberedState } from "../lib/viewMemory";
import { CatalogBallImage } from "./CatalogBallImage";
import { MiniPins } from "./MiniPins";
import { LoadingCard } from "./ui/LoadingCard";
import { EmptyState } from "./ui/EmptyState";
import { IconButton } from "./ui/IconButton";
import type { Manufacturer } from "../types/catalog";
import { isBabySplit, isSplit, isWashout } from "../lib/pins";
import {
  findRateLeaders,
  RATE_LEADER_MIN_BALLS,
  type BallGameCell,
  type BallPerformance,
  type BallPerformanceReport,
  type BowlingStats,
  type GameMetricPoint,
  type LeaveStats,
  type RateLeaders,
  type SessionMetricPoint,
  type SessionTrendPoint
} from "../lib/stats";
import { BallGameSessionsDialog } from "./BallGameSessionsDialog";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { SessionTrendChart } from "./SessionTrendChart";
import { MetricTrendChart } from "./MetricTrendChart";
import { Info } from "lucide-react";
import type { Game } from "../types/bowling";
import { GROUP_HEADING } from "./ui/typography";

/** One numeric column: wide enough for "100%", right-aligned so the digits
 *  line up down the card. */
const RATE_COLUMN = "w-9 shrink-0 text-right";

/** The stats a tile can put on the chart, and how each one is drawn.
 *
 *  Every value is read off a `BowlingStats` that `calculateStats` produced, so
 *  the point on the line and the number on the tile are the same call and
 *  cannot drift (ADR-061b). `min`/`max` are the bounds the metric cannot leave;
 *  `minSpan` is the smallest range the chart will draw, so a tidy run does not
 *  get magnified into a cliff. */
const METRICS = {
  average: {
    label: "Avg",
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
  }
} as const;

export type MetricKey = keyof typeof METRICS;

/** The metrics a picker can offer, in tile order. Exported so the Game-by-game
 *  screen can build the same picker over the same specs (ADR-063b). */
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** What each metric is called and how it is drawn, for anything outside this
 *  file that plots one. */
export function metricSpec(metric: MetricKey) {
  return METRICS[metric];
}

/** The definition behind a metric, where it has one. */
export function metricNote(metric: MetricKey): string | undefined {
  return METRIC_NOTE[metric];
}

// Definitions, tapped rather than printed: read once, then in the way.
//
// Only for a stat whose name does not already say it. Pocket, strike and first
// ball each explain themselves, and the notes they used to carry restated the
// label and then padded. Not every number needs a sentence.
const CARRY_NOTE = "Carry: pocket hits that struck.";
const SPARE_NOTE = "Spare: makeable leaves converted, excludes splits and washouts.";

/** The note for a graphable stat, where there is one, shown from the chart it
 *  is plotted on rather than from the tile (ADR-061b).
 *
 *  Two of six. Average, pocket, strike and first ball are named plainly enough
 *  by their own labels, and the notes they carried restated the label and then
 *  padded. */
const METRIC_NOTE: Partial<Record<MetricKey, string>> = {
  sparePct: SPARE_NOTE,
  carryPct: CARRY_NOTE
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
  /** Rendered directly under the metric tiles. The Stats tab puts its
   *  drill-downs here: they belong with the numbers they break down, and the
   *  screen's one header action is the share (DESIGN-LANGUAGE §1). */
  underTiles?: ReactNode;
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
  underTiles
}: StatsProps) {
  // One note at a time, opened by tapping the stat it explains. A definition
  // read once is enough, so it stays a tap rather than permanent copy.
  const [note, setNote] = useState<string | null>(null);

  const toggleNote = (text: string) => setNote((curr) => (curr === text ? null : text));

  // Once for the card, not once per row.
  const rateLeaders = findRateLeaders(ballPerformance?.balls ?? []);

  // Which stat the chart is plotting. Remembered, so leaving the tab and
  // coming back does not silently drop you back on the average.
  const [metric, setMetric] = useRememberedState<MetricKey>(`${memoryKey}:metric`, "average");
  const [metricNoteOpen, setMetricNoteOpen] = useState(false);
  const spec = METRICS[metric];

  // One header for either chart: what is plotted, and the definition behind an
  // info control rather than printed under it.
  const chartHeader = (
    <div className="mb-1">
      <div className="flex items-center justify-between gap-2">
        {/* The points are games inside a session sheet and nights or game slots
            on the Stats tab, and the header has to say which. Where there is a
            choice, the "by …" half of it is the control. */}
        <h2 className={GROUP_HEADING}>
          {spec.label} by {gameMetrics ? "game" : "session"}
        </h2>
        {METRIC_NOTE[metric] && (
          <IconButton
            label={`What ${spec.label} counts`}
            compact
            onClick={() => setMetricNoteOpen((v) => !v)}
          >
            <Info size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {metricNoteOpen && METRIC_NOTE[metric] && (
        <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{METRIC_NOTE[metric]}</p>
      )}
    </div>
  );

  if (isLoading) return <LoadingCard />;

  if (stats.totalGames === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No stats yet"
        description="One finished game is enough to start. Strike rate, spare conversions and average come from there."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        <Tile label="Games" value={String(stats.completedGames)} />
        {/* High over low, each on its own line, two 3-digit scores side by
            side don't fit the tile width. */}
        <Tile
          label=""
          valueClass="text-xs text-ink"
          value={
            // Score left, letter right, the pair centred as one block so the
            // two rows line up whatever the digit count.
            <span className="mx-auto flex w-fit flex-col leading-tight">
              <span className="flex items-baseline gap-1 text-accent">
                <span className="flex-1 text-left">{fmt(stats.highGame)}</span>
                <span className="text-ink-tertiary">H</span>
              </span>
              <span className="flex items-baseline gap-1 text-danger-600">
                <span className="flex-1 text-left">{fmt(stats.lowGame)}</span>
                <span className="text-ink-tertiary">L</span>
              </span>
            </span>
          }
        />
        <MetricTile
          metric="average"
          value={fmt(stats.averageScore)}
          selected={metric === "average"}
          onSelect={setMetric}
        />
        <MetricTile
          metric="strikePct"
          value={pct(stats.strikePct)}
          selected={metric === "strikePct"}
          onSelect={setMetric}
        />
        <MetricTile
          metric="sparePct"
          value={pct(stats.sparePct)}
          selected={metric === "sparePct"}
          onSelect={setMetric}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <MetricTile
          metric="pocketPct"
          value={pct(stats.pocketPct)}
          selected={metric === "pocketPct"}
          onSelect={setMetric}
        />
        <MetricTile
          metric="carryPct"
          value={pct(stats.carryPct)}
          selected={metric === "carryPct"}
          onSelect={setMetric}
        />
        <MetricTile
          metric="firstBallAverage"
          value={oneDp(stats.firstBallAverage)}
          selected={metric === "firstBallAverage"}
          onSelect={setMetric}
        />
      </div>

      {underTiles}

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

      {/* The leave note is rendered down with the leave cards it explains, so
          the answer lands where the tap was. */}
      {note && note !== LEAVE_NOTE && <StatNote text={note} onDismiss={() => setNote(null)} />}

      {ballPerformance && ballPerformance.balls.length > 0 && (
        <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
          <h2 className={GROUP_HEADING}>Ball performance</h2>
          {/* Column headings on their own line, at the widths every ball row
              below uses, so each rate sits under the letter that names it.
              The heading above them is too long to share the line. */}
          <div className="flex items-center gap-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">
            <span className="h-3 w-7 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1" aria-hidden="true" />
            {[["P", "Pocket"], ["C", "Carry"], ["S", "Strike"]].map(([label, full]) => (
              <span key={label} className={RATE_COLUMN} title={full}>
                <abbr title={full} className="no-underline">{label}</abbr>
              </span>
            ))}
            <span className={RATE_COLUMN}>Balls</span>
            <span className="w-3.5 shrink-0" aria-hidden="true" />
          </div>
          <div>
            <ul className="divide-y divide-edge">
              {ballPerformance.balls.map((b) => (
                <BallPerformanceRow
                  key={b.ballId}
                  ball={b}
                  leaders={rateLeaders}
                  memoryKey={memoryKey}
                  onOpenGame={onOpenGame}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      {(() => {
        // Only leaves a ball could follow. These cards are about converting,
        // and a leave off the last ball of the 10th has no spare to convert:
        // it used to sit here as a bare "0/0" with a "+1" beside it explaining
        // why. The frequency it was reported for is on the ball's own leaves.
        const all = (leaves ?? []).filter((l) => l.chances > 0);
        if (all.length === 0) return null;
        // Three groups, easiest first: makeables (ordinary leaves), washouts
        // (head pin standing with a gap behind it), and real splits.
        const splits = all.filter((l) => isSplit(l.pins) && !isBabySplit(l.pins));
        const washouts = all.filter((l) => isWashout(l.pins));
        const makeables = all.filter(
          (l) => !isWashout(l.pins) && (!isSplit(l.pins) || isBabySplit(l.pins))
        );
        return (
          <>
            <LeaveSection
              title="Makeables"
              leaves={makeables}
              onExplain={() => toggleNote(LEAVE_NOTE)}
            />
            <LeaveSection
              title="Washouts"
              leaves={washouts}
              onExplain={() => toggleNote(LEAVE_NOTE)}
            />
            <LeaveSection
              title="Splits"
              leaves={splits}
              onExplain={() => toggleNote(LEAVE_NOTE)}
            />
            {note === LEAVE_NOTE && (
              <StatNote text={LEAVE_NOTE} onDismiss={() => setNote(null)} />
            )}
          </>
        );
      })()}
    </div>
  );
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

function BallPerformanceRow({
  ball,
  leaders,
  memoryKey,
  onOpenGame
}: {
  ball: BallPerformance;
  leaders: RateLeaders;
  memoryKey: string;
  onOpenGame?: (sessionId: number, gameId: number, ballId?: number) => void;
}) {
  // A rate leads only if the ball has enough balls behind it to be in the
  // running at all, so a thin row can never light up.
  const eligible = ball.firstBalls >= RATE_LEADER_MIN_BALLS;
  const leads = (value: number | null, best: number | null) =>
    eligible && value !== null && value === best;
  // Remembered per ball: a drill-down goes to a session, and coming back to a
  // collapsed row would lose the reader's place.
  const [open, setOpen] = useRememberedState(`${memoryKey}:ball:${ball.ballId}`, false);
  const [drilldown, setDrilldown] = useState<BallGameCell | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm"
      >
        <span className="h-7 w-7 shrink-0">
          {ball.imageThumb || ball.brand ? (
            <CatalogBallImage
              src={ball.imageThumb}
              alt=""
              brand={ball.brand as Manufacturer}
              size="thumb"
            />
          ) : (
            <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{ball.name}</span>
        {/* Pocket, carry, strike, then the balls behind them, each under the
            letter that names it in the card heading. */}
        <RateCell
          value={ball.pocketPct}
          leads={leads(ball.pocketPct, leaders.pocketPct)}
          label="pocket"
        />
        <RateCell
          value={ball.carryPct}
          leads={leads(ball.carryPct, leaders.carryPct)}
          label="carry"
        />
        <RateCell
          value={ball.strikePct}
          leads={leads(ball.strikePct, leaders.strikePct)}
          label="strike"
        />
        <span className={`${RATE_COLUMN} text-xs tabular-nums text-ink-secondary`} aria-label={`${ball.firstBalls} balls`}>
          {ball.firstBalls}
        </span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-2">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-ink-tertiary">
                <th className="text-left font-semibold">Game</th>
                {ball.byGame.map((c) => (
                  <th key={c.gameNumber} className="text-right font-semibold">
                    {onOpenGame && c.sessions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDrilldown(c)}
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

          {/* The leave note is rendered down with the leave cards it explains, so
          the answer lands where the tap was. */}
      {note && note !== LEAVE_NOTE && <StatNote text={note} onDismiss={() => setNote(null)} />}

          {drilldown && onOpenGame && (
            <BallGameSessionsDialog
              open
              ballName={ball.name}
              gameNumber={drilldown.gameNumber}
              sessions={drilldown.sessions}
              onSelect={(sessionId, gameId) => onOpenGame(sessionId, gameId, ball.ballId)}
              onClose={() => setDrilldown(null)}
            />
          )}

          {ball.leaves.length > 0 && (
            // Grouped the way the leave cards below are, easiest first, and
            // scrolled rather than cut at four: every leave the ball left is
            // part of the answer.
            <div className="grid auto-cols-[calc((100%-1.125rem)/4)] grid-flow-col gap-1.5 overflow-x-auto overscroll-x-contain">
              {[...ball.leaves]
                .sort((a, b) => leaveGroup(a.pins) - leaveGroup(b.pins))
                .map((leave) => (
                  <LeaveCountCell key={leave.pins.join("-")} leave={leave} />
                ))}
            </div>
          )}
        </div>
      )}
    </li>
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

function LeaveSection({
  title,
  leaves,
  onExplain
}: {
  title: string;
  leaves: LeaveStats[];
  onExplain: () => void;
}) {
  if (leaves.length === 0) return null;
  // Most-shot-at first, so the leaves with meaningful sample sizes lead. By
  // chances rather than attempts, matching what the cells below report.
  const sorted = [...leaves].sort((a, b) => b.chances - a.chances);
  return (
    <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <h2 className="mb-3">
        <button type="button" onClick={onExplain} className={GROUP_HEADING}>
          {title}
        </button>
      </h2>
      {/* Three to a row, not four. A tabular "100%" is 37px and "10/10" is
          29px, which will not both fit a quarter of 390px however the type is
          sized: at four the count was silently clipping. Three leaves room for
          the widest pairing at full size, with the count hard left and the rate
          hard right in every cell. */}
      <div className="grid grid-cols-3 gap-1.5">
        {sorted.map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} />
        ))}
      </div>
    </div>
  );
}

/** The three groups the leave cards are split into, easiest first: makeables,
 *  then washouts, then real splits. Head pin standing and head pin down are
 *  exclusive, so a leave lands in exactly one. */
function leaveGroup(pins: LeaveStats["pins"]): number {
  if (isWashout(pins)) return 1;
  if (isSplit(pins) && !isBabySplit(pins)) return 2;
  return 0;
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
    </div>
  );
}

function LeaveCell({ leave }: { leave: LeaveStats }) {
  return (
    // px-1.5 rather than a square p-2: four of these fit a 390px row, and the
    // widest pairing ("10/10" beside "100%") overflowed the padding and put
    // the percent sign on the border.
    <div className="flex flex-col items-center gap-1 rounded-xl border border-edge bg-surface px-1.5 py-2 text-center shadow-sm">
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
    </div>
  );
}

/** A stat tile that also picks what the chart plots (ADR-061b). `aria-pressed`
 *  rather than a tab role, matching every other selectable control here. */
function MetricTile({
  metric,
  value,
  selected,
  onSelect
}: {
  metric: MetricKey;
  value: ReactNode;
  selected: boolean;
  onSelect: (metric: MetricKey) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(metric)}
      className={`w-full rounded-lg border px-1 py-2 text-center shadow-sm ${
        selected ? "border-accent-fill bg-accent-soft" : "border-edge bg-surface"
      }`}
    >
      <p className={`text-lg font-bold tabular-nums ${selected ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
      <p
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          selected ? "text-accent" : "text-ink-secondary"
        }`}
      >
        {METRICS[metric].label}
      </p>
    </button>
  );
}

function Tile({
  label,
  value,
  valueClass = "text-lg text-ink",
  onClick
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick?: () => void;
}) {
  const className = "rounded-xl border border-edge bg-surface px-1 py-2 text-center shadow-sm";
  const body = (
    <>
      <p className={`font-bold tabular-nums ${valueClass}`}>{value}</p>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      )}
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${className} w-full`}>
      {body}
    </button>
  );
}

/** One rate in the ball table. The best in its column is called out in the
 *  accent, and said out loud for anyone not reading the colour. */
function RateCell({
  value,
  leads,
  label
}: {
  value: number | null;
  leads: boolean;
  label: string;
}) {
  return (
    <span
      className={`${RATE_COLUMN} text-xs font-semibold tabular-nums ${leads ? "text-accent" : "text-ink"}`}
      aria-label={`${label} ${pct(value)}${leads ? ", best" : ""}`}
    >
      {pct(value)}
    </span>
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
