import { BarChart3, ChevronDown } from "lucide-react";
import { useState } from "react";
import { MiniPins } from "./MiniPins";
import { isBabySplit, isSplit } from "../lib/pins";
import type { BallUsage, BowlingStats, LeaveStats } from "../lib/stats";
import type { PinNumber } from "../types/bowling";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballUsage?: BallUsage[];
}

export function Stats({ stats, isLoading = false, leaves, ballUsage }: StatsProps) {
  const [showBallUsage, setShowBallUsage] = useState(false);

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
        <Tile label="High" value={fmt(stats.highGame)} />
        <Tile label="Games" value={String(stats.completedGames)} />
        <Tile label="Strike" value={pct(stats.strikePct)} />
        <Tile label="Spare" value={pct(stats.sparePct)} />
      </div>

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
              <li key={b.ballId} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate pr-3 font-medium text-ink-strong">{b.name}</span>
                <span className="shrink-0 tabular-nums text-ink-secondary">
                  <span className="font-semibold text-ink">{b.frames}</span>{" "}
                  {b.frames === 1 ? "frame" : "frames"}
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
                <LeaveGrid leaves={spares} />
              </div>
            )}

            {splits.length > 0 && (
              <div className="rounded-lg border border-edge bg-surface-muted p-3">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Splits
                </h2>
                <LeaveGrid leaves={splits} muted />
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
 * One-off leaves would otherwise bury them, so when both groups exist the
 * under-sampled ones drop into a dimmed "Rare leaves" section.
 */
function LeaveGrid({ leaves, muted = false }: { leaves: LeaveStats[]; muted?: boolean }) {
  const sorted = [...leaves].sort((a, b) => b.attempts - a.attempts);
  const common = sorted.filter((l) => l.attempts >= RARE_ATTEMPTS);
  const rare = sorted.filter((l) => l.attempts < RARE_ATTEMPTS);
  const partitioned = common.length > 0 && rare.length > 0;
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {(partitioned ? common : sorted).map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} muted={muted} />
        ))}
      </div>
      {partitioned && (
        <>
          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
            Rare leaves (under {RARE_ATTEMPTS} attempts)
          </p>
          <div className="grid grid-cols-4 gap-1.5 opacity-60">
            {rare.map((leave) => (
              <LeaveCell key={leave.pins.join("-")} leave={leave} muted={muted} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function LeaveCell({ leave, muted = false }: { leave: LeaveStats; muted?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center ${
        muted ? "border-edge bg-surface/60" : "border-edge bg-surface shadow-sm"
      }`}
    >
      <MiniPins standing={leave.pins} size="sm" />
      <p className="text-xs font-medium text-ink-strong">{formatLeave(leave.pins)}</p>
      <p
        className={`text-sm font-bold ${
          leave.conversionPct !== null && leave.conversionPct >= 70
            ? "text-accent"
            : "text-ink"
        }`}
      >
        {leave.conversionPct !== null ? `${leave.conversionPct}%` : "—"}
      </p>
      <p className="text-[11px] text-ink-secondary">
        {leave.conversions}/{leave.attempts}
      </p>
    </div>
  );
}

function formatLeave(pins: PinNumber[]): string {
  if (pins.length === 1) return `${pins[0]}-pin`;
  return pins.join("-");
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface px-1 py-2 text-center shadow-sm">
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
    </div>
  );
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
