import { BarChart3, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CatalogBallImage } from "./CatalogBallImage";
import { MiniPins } from "./MiniPins";
import type { Manufacturer } from "../types/catalog";
import { isBabySplit, isSplit, isWashout } from "../lib/pins";
import type { BallUsage, BowlingStats, LeaveStats } from "../lib/stats";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballUsage?: BallUsage[];
}

export function Stats({
  stats,
  isLoading = false,
  leaves,
  ballUsage
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
        <Tile label="Games" value={String(stats.completedGames)} />
        {/* High over low, each on its own line — two 3-digit scores side by
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
        <Tile label="Avg" value={fmt(stats.averageScore)} />
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
          Spare % counts makeable leaves only. Washouts and splits are left out.
          Tap to dismiss.
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
            <LeaveSection title="Makeables" leaves={makeables} />
            <LeaveSection title="Washouts" leaves={washouts} />
            <LeaveSection title="Splits" leaves={splits} />
          </>
        );
      })()}
    </div>
  );
}

function LeaveSection({ title, leaves }: { title: string; leaves: LeaveStats[] }) {
  if (leaves.length === 0) return null;
  // Most-bowled first, so the leaves with meaningful sample sizes lead.
  const sorted = [...leaves].sort((a, b) => b.attempts - a.attempts);
  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        {title}
      </h2>
      <div className="grid grid-cols-4 gap-1.5">
        {sorted.map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} />
        ))}
      </div>
    </div>
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
  valueClass = "text-lg text-ink",
  onClick
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick?: () => void;
}) {
  const className = "rounded-lg border border-edge bg-surface px-1 py-2 text-center shadow-sm";
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

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
