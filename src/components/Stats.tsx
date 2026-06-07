import { BarChart3 } from "lucide-react";
import type { BowlingStats } from "../lib/stats";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
}

export function Stats({ stats, isLoading = false }: StatsProps) {
  if (isLoading) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Loading...
      </p>
    );
  }

  if (stats.totalGames === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <BarChart3 className="mx-auto mb-2 text-slate-400" aria-hidden="true" size={24} />
        <p className="text-sm text-slate-600">
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

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Bar label="Strikes" pct={stats.strikePct} />
        <Bar label="Spares" pct={stats.sparePct} />
      </div>

      {stats.byAlley.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By alley
          </h2>
          <ul className="divide-y divide-slate-100">
            {stats.byAlley.map((a) => (
              <li key={a.alley} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                  {a.alley}
                </span>
                <span className="text-xs text-slate-500">
                  {a.games} {a.games === 1 ? "game" : "games"}
                </span>
                <span className="w-16 text-right text-sm font-semibold text-felt-700">
                  {fmt(a.average)} avg
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number | null }) {
  const value = pct ?? 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-felt-700" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}
