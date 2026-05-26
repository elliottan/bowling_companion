import { History, Trophy } from "lucide-react";
import { calculateGameScore } from "../lib/scoring";
import type { SessionSummary } from "../types/bowling";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  onOpenSession: (sessionId: number) => void;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession
}: SessionHistoryProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Loading session history...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <History className="mx-auto mb-3 text-slate-400" aria-hidden="true" size={28} />
        <h2 className="text-lg font-bold text-slate-950">No sessions yet</h2>
        <p className="mt-2 text-sm text-slate-600">
          Start a session and completed games will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map(({ session, games }) => (
        <article
          key={session.id}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-felt-700">{session.date}</p>
              <h2 className="text-xl font-bold text-slate-950">{session.alley_name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {session.oil_pattern ? `${session.oil_pattern} pattern` : "No oil pattern noted"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => session.id && onOpenSession(session.id)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => {
              const score = calculateGameScore(game.frames);
              const displayScore = game.final_score ?? (score.isComplete ? score.total : `${score.total}+`);

              return (
                <div
                  key={game.id}
                  className="rounded-lg border border-slate-200 bg-lane-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">
                        Game {game.game_number}
                      </p>
                      <p className="text-sm text-slate-600">
                        Lane {game.lane_number || "not set"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-felt-700">
                      <Trophy aria-hidden="true" size={18} />
                      <span className="text-2xl font-bold">{displayScore}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
