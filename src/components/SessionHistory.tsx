import { History } from "lucide-react";
import { calculateGameScore } from "../lib/scoring";
import type { SessionSummary } from "../types/bowling";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  onOpenSession: (sessionId: number) => void;
  activeSessionId?: number | null;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId
}: SessionHistoryProps) {
  if (isLoading) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Loading...
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <History className="mx-auto mb-2 text-slate-400" aria-hidden="true" size={24} />
        <p className="text-sm text-slate-600">
          No sessions yet. Start one from the home tab.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {sessions.map(({ session, games }) => {
        const isActive = session.id != null && session.id === activeSessionId;
        return (
        <li key={session.id}>
          <button
            type="button"
            onClick={() => session.id && onOpenSession(session.id)}
            className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm hover:bg-slate-50 ${
              isActive
                ? "border-felt-700 ring-1 ring-felt-700"
                : "border-slate-200 hover:border-felt-700/40"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-950">
                  {session.alley_name}
                </p>
                <p className="text-xs text-slate-500">
                  {session.date}
                  {session.oil_pattern && ` · ${session.oil_pattern}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {isActive && (
                  <span className="inline-flex items-center rounded-full bg-felt-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Active
                  </span>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {games.length} {games.length === 1 ? "game" : "games"}
                </p>
              </div>
            </div>

            {games.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {games.map((game) => {
                  const score = calculateGameScore(game.frames);
                  const display =
                    game.final_score ??
                    (score.isComplete ? score.total : `${score.total}+`);
                  return (
                    <span
                      key={game.id}
                      className="inline-flex items-center gap-1 rounded-md bg-lane-50 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <span className="text-slate-500">G{game.game_number}</span>
                      <span className="text-felt-700">{display}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {games.some((game) => game.notes) && (
              <dl className="mt-2 space-y-0.5">
                {games
                  .filter((game) => game.notes)
                  .map((game) => (
                    <div key={game.id} className="flex gap-1.5 text-xs text-slate-500">
                      <dt className="shrink-0 font-semibold">G{game.game_number}</dt>
                      <dd className="min-w-0 truncate">{game.notes}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </button>
        </li>
        );
      })}
    </ul>
  );
}
