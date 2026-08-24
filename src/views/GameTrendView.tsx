import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { GROUP_HEADING } from "../components/ui/typography";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import { calculateGameNumberTrend, type GameNumberStats } from "../lib/stats";
import { useHandedness } from "../lib/handednessContext";
import { useRememberedState } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";

type Columns = "scoring" | "first ball";

const COLUMN_SETS: Columns[] = ["scoring", "first ball"];

/** Below this a slot is one or two nights of luck, so it is drawn muted and
 *  its numbers are not what the headline is read off. */
const THIN = 3;

/** Tallest a bar can draw, in px. */
const BAR_PX = 104;

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
  const { filtered, activeLanes, setGameNumber } = useSessionFilters();
  const handedness = useHandedness();
  const [columns, setColumns] = useRememberedState<Columns>("game-trend:columns", "scoring");

  const trend = useMemo(
    () => calculateGameNumberTrend(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );

  const scored = trend.filter((t) => t.average !== null);

  return (
    <PushScreen title="Game by game" onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {scored.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No games to compare yet"
            description="Bowl a couple of nights and your first game lands next to your last one here."
          />
        ) : (
          <>
            <AverageBars trend={scored} />

            <div className="mb-2 mt-4 flex items-center justify-between gap-3">
              <h2 className={GROUP_HEADING}>By game</h2>
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
              Tap a game to narrow every stat to that slot. Slots under {THIN} games are greyed
              out until there are enough of them.
            </p>
          </>
        )}
      </div>
    </PushScreen>
  );
}

/** Average by slot, so the shape of a night reads before the numbers do. */
function AverageBars({ trend }: { trend: GameNumberStats[] }) {
  const averages = trend.map((t) => t.average as number);
  const top = Math.max(...averages);
  const bottom = Math.min(...averages);
  // Half a band of headroom, and a floor on the range so a 5-pin wobble and a
  // 50-pin collapse do not draw the same, the way the trend charts do it.
  const high = top + 10;
  const low = Math.min(bottom - 10, high - 60);
  const span = high - low;

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
      <div className="flex items-end gap-2">
        {trend.map((slot) => {
          const value = slot.average as number;
          const thin = slot.games < THIN;
          return (
            <div key={slot.gameNumber} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={`text-xs font-bold tabular-nums ${thin ? "text-ink-secondary" : "text-ink"}`}
              >
                {value}
              </span>
              {/* Pixels, not a percentage: the column this sits in is
                  auto-height, so a percentage has nothing to resolve against
                  and the bar collapses to nothing. */}
              <div
                className={`w-full rounded-t ${thin ? "bg-edge-strong" : "bg-accent-fill"}`}
                style={{ height: Math.max(4, Math.round(((value - low) / span) * BAR_PX)) }}
              />
              <span className="text-[10px] font-semibold text-ink-secondary">
                G{slot.gameNumber}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameRow({
  slot,
  columns,
  onClick
}: {
  slot: GameNumberStats;
  columns: Columns;
  onClick: () => void;
}) {
  const thin = slot.games < THIN;
  const cells =
    columns === "scoring"
      ? [fmt(slot.average), pct(slot.strikePct), pct(slot.sparePct)]
      : [pct(slot.pocketPct), pct(slot.carryPct)];

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
