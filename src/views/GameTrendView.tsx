import { useMemo, useState } from "react";
import { Info, LayoutGrid } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { IconButton } from "../components/ui/IconButton";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import { MetricTrendChart } from "../components/MetricTrendChart";
import { METRIC_KEYS, metricNote, metricSpec, type MetricKey } from "../components/Stats";
import { calculateGameNumberMetrics, type GameNumberMetricPoint } from "../lib/stats";
import { useHandedness } from "../lib/handednessContext";
import { useRememberedState } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";

type Columns = "scoring" | "first ball";

const COLUMN_SETS: Columns[] = ["scoring", "first ball"];

/** Below this a slot is one or two nights of luck, so it is drawn muted and
 *  its numbers are not what the headline is read off. */
const THIN = 3;

/** Slots visible at once before the plot scrolls sideways. Four is a normal
 *  night, so the common case never scrolls. */
const GAME_WINDOW = 4;

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
  const { filtered, activeLanes, setGameNumber, isLoading } = useSessionFilters();
  const handedness = useHandedness();
  const [columns, setColumns] = useRememberedState<Columns>("game-trend:columns", "scoring");
  const [metric, setMetric] = useRememberedState<MetricKey>("game-trend:metric", "average");
  const [noteOpen, setNoteOpen] = useState(false);

  const trend = useMemo(
    () => calculateGameNumberMetrics(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );

  const spec = metricSpec(metric);
  const scored = trend.filter((t) => t.stats.averageScore !== null);

  return (
    <PushScreen title="Game by game" onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {isLoading ? (
          <LoadingCard />
        ) : scored.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No games to compare yet"
            description="Two nights is enough to put your first game next to your last."
          />
        ) : (
          <>
            {/* The same picker the Stats tiles are, in the shape a pushed
                screen can hold: a row of chips rather than eight tiles. */}
            <div className="mb-2 flex flex-wrap gap-2">
              {METRIC_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                  className={`relative inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-semibold ${TAP_TARGET_44} ${
                    metric === key
                      ? "border border-accent-fill bg-accent-fill text-accent-on-fill"
                      : "border border-edge-strong bg-surface text-ink-strong"
                  }`}
                >
                  {metricSpec(key).label}
                </button>
              ))}
            </div>

            <MetricTrendChart
              points={trend.map((p) => ({
                key: `n${p.gameNumber}`,
                axis: `G${p.gameNumber}`,
                title: `Game ${p.gameNumber}`,
                detail: `${p.games} ${p.games === 1 ? "game" : "games"}`,
                value: spec.value(p.stats)
              }))}
              header={
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className={GROUP_HEADING}>{spec.label} by game</h2>
                  {/* Only where the stat has a definition worth reading. */}
                  {metricNote(metric) && (
                    <IconButton
                      label={`What ${spec.label} counts`}
                      compact
                      onClick={() => setNoteOpen((v) => !v)}
                    >
                      <Info size={16} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              }
              overall={null}
              format={spec.format}
              min={spec.min}
              max={spec.max}
              minSpan={spec.minSpan}
              windowSize={GAME_WINDOW}
              onOpen={(key) => {
                const n = Number(key.slice(1));
                if (Number.isInteger(n) && n > 0) {
                  setGameNumber(n);
                  onBack();
                }
              }}
            />

            {noteOpen && metricNote(metric) && (
              <p className="mt-2 px-0.5 text-xs leading-relaxed text-ink-secondary">
                {metricNote(metric)}
              </p>
            )}

            <div className="mb-2 mt-4 flex items-center justify-between gap-3">
              <h2 className={GROUP_HEADING}>All of them</h2>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1">
                {COLUMN_SETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={columns === c}
                    onClick={() => setColumns(c)}
                    className={`relative h-9 rounded-md px-3 text-xs font-semibold capitalize ${TAP_TARGET_44} ${
                      columns === c ? "bg-surface text-accent shadow-sm" : "text-ink-strong"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-edge bg-surface shadow-sm">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">
                <span className="min-w-0 flex-1" aria-hidden="true" />
                {(columns === "scoring" ? ["Avg", "Strike", "Spare"] : ["Pocket", "Carry"]).map(
                  (label) => (
                    <span key={label} className="w-12 shrink-0 text-right">
                      {label}
                    </span>
                  )
                )}
                <span className="w-10 shrink-0 text-right">Games</span>
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
              Tap a game to filter every stat to it. Slots under {THIN} games are greyed out.
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
          Game {slot.gameNumber}
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
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-tertiary">
          {slot.games}
        </span>
      </button>
    </li>
  );
}

function fmt(value: number | null): string {
  return value === null ? "-" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}
