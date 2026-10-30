import { plural, t } from "@lingui/core/macro";
import { formatNumber, formatPercent } from "../lib/format";
import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { MetricTrendChart } from "../components/MetricTrendChart";
import { GAME_LABELS_UP_TO, METRIC_KEYS, metricNote, metricSpec, type MetricKey } from "../components/Stats";
import { calculateGameNumberMetrics, type GameNumberMetricPoint } from "../lib/stats";
import { useHandedness } from "../lib/handednessContext";
import { useRememberedState } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";
import { Chip } from "../components/ui/Chip";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { ErrorBanner } from "../components/ErrorBanner";

type Columns = "scoring" | "first ball";

const COLUMN_SETS: Columns[] = ["scoring", "first ball"];

/** Below this a game number is one or two sessions of luck, so it is drawn muted and
 *  its numbers are not what the headline is read off. */
const THIN = 3;

interface GameTrendViewProps {
  onBack: () => void;
}

/**
 * Every first game against every second game, and so on (ADR-056).
 *
 * The same block of numbers as the Stats tab, sliced by position in the night
 * rather than by date. It is a table rather than five charts because the
 * question is a comparison: the rows have to sit next to each other to answer
 * it. Two column sets rather than one wide table, because five numeric columns
 * do not fit a phone (docs/DESIGN-LANGUAGE.md §4b).
 */
export function GameTrendView({ onBack }: GameTrendViewProps) {
  const { filtered, activeLanes, setGameNumber, isLoading, error } = useSessionFilters();
  const handedness = useHandedness();
  const [columns, setColumns] = useRememberedState<Columns>("game-trend:columns", "scoring");
  const [metric, setMetric] = useRememberedState<MetricKey>("game-trend:metric", "average");

  const trend = useMemo(
    () => calculateGameNumberMetrics(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );

  const spec = metricSpec(metric);
  const scored = trend.filter((p) => p.stats.averageScore !== null);

  return (
    <PushScreen title={t`Game by game`} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {error ? (
          <ErrorBanner>{t`Your sessions could not be read. Reload the app, then try again.`}</ErrorBanner>
        ) : isLoading ? (
          <LoadingCard />
        ) : scored.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title={t`No games to compare yet`}
            description={t`Two sessions is enough to put your first game next to your last.`}
          />
        ) : (
          <>
            {/* The same picker the Stats tiles are, in the shape a pushed
                screen can hold: a row of chips rather than eight tiles. */}
            <div className="mb-2 flex flex-wrap gap-2">
              {METRIC_KEYS.map((key) => (
                <Chip key={key} selected={metric === key} onClick={() => setMetric(key)}>
                  {metricSpec(key).label}
                </Chip>
              ))}
            </div>

            <MetricTrendChart
              points={trend.map((p) => ({
                key: `n${p.gameNumber}`,
                axis: `G${p.gameNumber}`,
                title: t`Game ${{ gameNumber: p.gameNumber }}`,
                detail: plural(p.games, { one: "# game", other: "# games" }),
                value: spec.value(p.stats)
              }))}
              header={
                <div className="mb-1">
                  <h2 className={GROUP_HEADING}>{spec.label} by game</h2>
                  <p className="mt-1 text-xs text-ink-secondary">{metricNote(metric)}</p>
                </div>
              }
              overall={null}
              format={spec.format}
              min={spec.min}
              max={spec.max}
              minSpan={spec.minSpan}
              labelAllUpTo={GAME_LABELS_UP_TO}
              onOpen={(key) => {
                const n = Number(key.slice(1));
                if (Number.isInteger(n) && n > 0) {
                  setGameNumber(n);
                  onBack();
                }
              }}
            />

            <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className={GROUP_HEADING}>{t`All of them`}</h2>
              {/* At least its width in English, wider for a longer label. */}
              <div className="min-w-44">
                <SegmentedControl
                  label={t`Columns`}
                  value={columns}
                  onChange={setColumns}
                  options={COLUMN_SETS.map((c) => ({ value: c, label: c === "scoring" ? t`Scoring` : t({ message: "First ball", comment: "Bowling term: the first ball thrown in a frame" }) }))}
                />
              </div>
            </div>

            {/* Dense like the app's other tables (ADR-219), so the columns
                hold their headings at every text size and in every language. */}
            <div className="type-cap-dense overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
              <div className="flex items-end gap-2 px-3 pb-1 pt-2 text-caption-2 font-bold uppercase leading-tight text-ink-tertiary">
                <span className="min-w-0 flex-1" aria-hidden="true" />
                {(columns === "scoring"
                  ? [
                      t({ message: "Avg", comment: "Column heading, short for average" }),
                      t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. Column heading." }),
                      t({ message: "Spare", comment: "Bowling term: all ten pins down with two balls. Column heading." })
                    ]
                  : [
                      t({ message: "Pocket", comment: "Bowling term: the pocket is where the ball hits the pins for the best chance of a strike. Column heading, a rate." }),
                      t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket strikes. Column heading, a rate." })
                    ]
                ).map((label) => (
                  <span key={label} className="w-12 shrink-0 text-right [overflow-wrap:anywhere]">
                    {label}
                  </span>
                ))}
                <span className="w-12 shrink-0 text-right [overflow-wrap:anywhere]">{t`Games`}</span>
              </div>
              <ul className="divide-y divide-edge">
                {trend.map((slot) => (
                  <GameRow
                    key={slot.gameNumber}
                    slot={slot}
                    columns={columns}
                    onClick={() => {
                      // The filter is shared, so the tab underneath is already
                      // narrowed by the time this screen slides away.
                      setGameNumber(slot.gameNumber);
                      onBack();
                    }}
                  />
                ))}
              </ul>
            </div>

            <p className="mt-3 px-0.5 text-xs leading-relaxed text-ink-secondary">
              {t`Tap a game to filter every stat to it. Games with fewer than ${{ thin: THIN }} played are grayed out.`}
            </p>
          </>
        )}
      </div>
    </PushScreen>
  );
}

function GameRow({
  slot,
  columns,
  onClick
}: {
  slot: GameNumberMetricPoint;
  columns: Columns;
  onClick: () => void;
}) {
  const thin = slot.games < THIN;
  const cells =
    columns === "scoring"
      ? [fmt(slot.stats.averageScore), pct(slot.stats.strikePct), pct(slot.stats.sparePct)]
      : [pct(slot.stats.pocketPct), pct(slot.stats.carryPct)];

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${thin ? "bg-surface-muted" : ""}`}
      >
        <span
          className={`min-w-0 flex-1 text-sm font-semibold ${thin ? "text-ink-secondary" : "text-ink"}`}
        >
          {t`Game ${{ gameNumber: slot.gameNumber }}`}
        </span>
        {cells.map((cell, i) => (
          <span
            key={i}
            className={`w-12 shrink-0 text-right text-xs font-semibold tabular-nums ${
              thin ? "text-ink-secondary" : "text-ink"
            }`}
          >
            {cell}
          </span>
        ))}
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-tertiary">
          {slot.games}
        </span>
      </button>
    </li>
  );
}

function fmt(value: number | null): string {
  return value === null ? "-" : formatNumber(value, 1);
}

function pct(value: number | null): string {
  return value === null ? "-" : formatPercent(value);
}
