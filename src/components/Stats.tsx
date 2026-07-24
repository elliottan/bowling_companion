import { BarChart3 } from "lucide-react";
import { describePinsStanding, isBabySplit, isSplit } from "../lib/pins";
import type { BallUsage, BowlingStats, LeaveStats } from "../lib/stats";
import type { PinNumber } from "../types/bowling";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballUsage?: BallUsage[];
}

export function Stats({ stats, isLoading = false, leaves, ballUsage }: StatsProps) {
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
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Avg" value={fmt(stats.averageScore)} />
        <Tile label="High" value={fmt(stats.highGame)} />
        <Tile label="Games" value={String(stats.completedGames)} />
      </div>

      <div className="space-y-3 rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <Bar label="Strikes" pct={stats.strikePct} />
        <Bar label="Spares" pct={stats.sparePct} subtitle="non-splits" />
      </div>

      {ballUsage && ballUsage.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Ball usage
          </h2>
          <ul className="divide-y divide-edge">
            {ballUsage.map((b) => (
              <li key={b.ballId} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-3 font-medium text-ink-strong">{b.name}</span>
                <span className="shrink-0 tabular-nums text-ink-secondary">
                  <span className="font-semibold text-ink">{b.frames}</span>{" "}
                  {b.frames === 1 ? "frame" : "frames"}
                  {" · "}
                  <span className="font-semibold text-ink">{b.games}</span>{" "}
                  {b.games === 1 ? "game" : "games"}
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
              <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Spare rates
                </h2>
                <LeaveGrid leaves={spares} />
              </div>
            )}

            {splits.length > 0 && (
              <div className="rounded-lg border border-edge bg-surface-muted p-4">
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
      <div className="grid grid-cols-3 gap-2">
        {(partitioned ? common : sorted).map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} muted={muted} />
        ))}
      </div>
      {partitioned && (
        <>
          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
            Rare leaves (under {RARE_ATTEMPTS} attempts)
          </p>
          <div className="grid grid-cols-3 gap-2 opacity-60">
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
        muted ? "border-edge bg-white/60" : "border-edge bg-surface shadow-sm"
      }`}
    >
      <MiniPinDisplay pins={leave.pins} />
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

function MiniPinDisplay({ pins }: { pins: PinNumber[] }) {
  const pinSet = new Set(pins);
  const rows: PinNumber[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-0.5"
      role="img"
      aria-label={describePinsStanding(pins)}
    >
      {rows.map((row) => (
        <div key={row.join("-")} className="flex gap-0.5">
          {row.map((pin) => (
            <div
              key={pin}
              className={`h-3.5 w-3.5 rounded-full text-[7px] leading-[14px] text-center font-bold ${
                pinSet.has(pin) ? "bg-felt-700 text-white" : "bg-surface-muted text-ink-tertiary"
              }`}
            >
              {pin}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatLeave(pins: PinNumber[]): string {
  if (pins.length === 1) return `${pins[0]}-pin`;
  return pins.join("-");
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface p-3 text-center shadow-sm">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
    </div>
  );
}

function Bar({ label, pct, subtitle }: { label: string; pct: number | null; subtitle?: string }) {
  const value = pct ?? 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-ink-strong">{label}</span>
        <span className="font-semibold text-ink">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      {subtitle && <p className="mb-1 text-[11px] text-ink-secondary">{subtitle}</p>}
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-felt-700" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}
