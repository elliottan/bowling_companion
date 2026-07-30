import { BarChart3, ChevronDown } from "lucide-react";
import { useState } from "react";
import { CatalogBallImage } from "./CatalogBallImage";
import { MiniPins } from "./MiniPins";
import type { Manufacturer } from "../types/catalog";
import { isBabySplit, isSplit } from "../lib/pins";
import type { BallUsage, BowlingStats, LeaveStats } from "../lib/stats";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballUsage?: BallUsage[];
  /**
   * Split under-sampled leaves into their own collapsible section. Only worth
   * it across all sessions — a single session never has the attempts for the
   * distinction to say anything.
   */
  partitionRare?: boolean;
}

export function Stats({
  stats,
  isLoading = false,
  leaves,
  ballUsage,
  partitionRare = true
}: StatsProps) {
  const [showBallUsage, setShowBallUsage] = useState(false);
  const [showSpareNote, setShowSpareNote] = useState(false);

  if (isLoading) {
    return (
      <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-ink-secondary shadow-sm">
        Loading...
      </p>
    );
  }

  if (stats.totalGames === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-surface p-6 text-center">
        <BarChart3 className="mx-auto mb-2 text-ink-tertiary" aria-hidden="true" size={24} />
        <p className="text-sm text-ink-secondary">
          No games yet. Stats appear once you finish a game.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        <Tile label="Avg" value={fmt(stats.averageScore)} />
        <Tile label="High" value={fmt(stats.highGame)} valueClass="text-accent" />
        <Tile label="Low" value={fmt(stats.lowGame)} valueClass="text-danger-600" />
        <Tile label="Strike" value={pct(stats.strikePct)} />
        <Tile
          label="Spare"
          value={pct(stats.sparePct)}
          onClick={() => setShowSpareNote((v) => !v)}
        />
      </div>

      {showSpareNote && (
        <button
          type="button"
          onClick={() => setShowSpareNote(false)}
          className="w-full rounded-lg border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
        >
          Spare % counts only non-split leaves — splits are excluded, so a bad rack
          doesn't drag the rate down. Tap to dismiss.
        </button>
      )}

      {ballUsage && ballUsage.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setShowBallUsage((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Ball usage
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={showBallUsage ? "rotate-180" : ""}
            />
          </button>
          <ul className={`divide-y divide-edge ${showBallUsage ? "mt-2" : "hidden"}`}>
            {ballUsage.map((b) => (
              <li key={b.ballId} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="h-7 w-7 shrink-0">
                  {b.imageThumb || b.brand ? (
                    <CatalogBallImage
                      src={b.imageThumb}
                      alt=""
                      brand={b.brand as Manufacturer}
                      size="thumb"
                    />
                  ) : (
                    <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{b.name}</span>
                <span className="shrink-0 tabular-nums text-ink-secondary">
                  <span className="font-semibold text-ink">{b.frames}</span>{" "}
                  {b.frames === 1 ? "shot" : "shots"}
                  {" · "}
                  {/* Games as a fraction of a 10-frame game — a ball thrown in
                      15 frames covers 1.5 games' worth of shots. */}
                  <span className="font-semibold text-ink">{(b.frames / 10).toFixed(1)}</span> games
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(() => {
        const all = leaves ?? [];
        const splits = all.filter((l) => isSplit(l.pins) && !isBabySplit(l.pins));
        const spares = all.filter((l) => !isSplit(l.pins) || isBabySplit(l.pins));
        if (all.length === 0) return null;
        return (
          <>
            {spares.length > 0 && (
              <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Spare rates
                </h2>
                <LeaveGrid leaves={spares} partitionRare={partitionRare} />
              </div>
            )}

            {splits.length > 0 && (
              <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Splits
                </h2>
                <LeaveGrid leaves={splits} partitionRare={partitionRare} />
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

const RARE_ATTEMPTS = 3;

/**
 * Leaves sorted by attempts (most bowled first) so meaningful rates lead.
 * Across all sessions, one-off leaves would bury the meaningful ones, so the
 * under-sampled ones fold into a collapsible "Rare leaves" section. A single
 * session has too few attempts for that split to mean anything — callers pass
 * `partitionRare={false}` there and every leave shows in one grid.
 */
function LeaveGrid({
  leaves,
  partitionRare = true
}: {
  leaves: LeaveStats[];
  partitionRare?: boolean;
}) {
  const [showRare, setShowRare] = useState(false);
  const sorted = [...leaves].sort((a, b) => b.attempts - a.attempts);
  const common = sorted.filter((l) => l.attempts >= RARE_ATTEMPTS);
  const rare = sorted.filter((l) => l.attempts < RARE_ATTEMPTS);
  const partitioned = partitionRare && common.length > 0 && rare.length > 0;
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {(partitioned ? common : sorted).map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} />
        ))}
      </div>
      {partitioned && (
        <>
          <button
            type="button"
            onClick={() => setShowRare((v) => !v)}
            className="mt-3 flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Rare leaves (under {RARE_ATTEMPTS} attempts)
            <ChevronDown size={16} aria-hidden="true" className={showRare ? "rotate-180" : ""} />
          </button>
          {showRare && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {rare.map((leave) => (
                <LeaveCell key={leave.pins.join("-")} leave={leave} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function LeaveCell({ leave }: { leave: LeaveStats }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm">
      <MiniPins standing={leave.pins} size="sm" />
      {/* The pin diagram already names the leave — attempts on the left, rate
          on the right, one row. */}
      <div className="flex w-full items-baseline justify-between gap-1">
        <span className="text-[11px] tabular-nums text-ink-secondary">
          {leave.conversions}/{leave.attempts}
        </span>
        <span
          className={`text-sm font-bold ${
            leave.conversionPct !== null && leave.conversionPct >= 70
              ? "text-accent"
              : "text-ink"
          }`}
        >
          {leave.conversionPct !== null ? `${leave.conversionPct}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass = "text-ink",
  onClick
}: {
  label: string;
  value: string;
  valueClass?: string;
  onClick?: () => void;
}) {
  const className = "rounded-lg border border-edge bg-surface px-1 py-2 text-center shadow-sm";
  const body = (
    <>
      <p className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${className} w-full`}>
      {body}
    </button>
  );
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
