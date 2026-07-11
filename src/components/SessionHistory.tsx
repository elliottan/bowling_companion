import { BarChart3, History } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { calculateGameScore } from "../lib/scoring";
import { updateSession } from "../services/bowlingRepository";
import { SessionFormDialog } from "./SessionFormDialog";
import { SessionLanePanel } from "./SessionLanePanel";
import type { NewSessionFormValues } from "./SessionForm";
import type { SessionSummary } from "../types/bowling";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  onOpenSession: (sessionId: number) => void;
  activeSessionId?: number | null;
  /** Called after a session is edited so the list can reload. */
  onSessionChanged?: () => void;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId,
  onSessionChanged
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
      {sessions.map((summary) => (
        <li key={summary.session.id}>
          <SessionRow
            summary={summary}
            isActive={summary.session.id != null && summary.session.id === activeSessionId}
            onOpen={onOpenSession}
            onSessionChanged={onSessionChanged}
          />
        </li>
      ))}
    </ul>
  );
}

/** Distinct lanes across a session's games, e.g. "Lane 9 / 10". */
function laneSummary(games: SessionSummary["games"]): string {
  const lanes = new Set<string>();
  for (const g of games) {
    const list = g.lanes ?? (g.lane_number ? [g.lane_number] : []);
    for (const l of list) if (l) lanes.add(l);
  }
  return lanes.size ? `Lane ${[...lanes].join(" / ")}` : "";
}

interface SessionRowProps {
  summary: SessionSummary;
  isActive: boolean;
  onOpen: (sessionId: number) => void;
  onSessionChanged?: () => void;
}

/** Tap a row to open the session; edit lives in the stats panel's pencil. */
function SessionRow({ summary, isActive, onOpen, onSessionChanged }: SessionRowProps) {
  const { session, games } = summary;
  const [showStats, setShowStats] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  async function handleSaveEdit(values: NewSessionFormValues) {
    if (!session.id) return;
    await updateSession(session.id, values);
    setShowEdit(false);
    onSessionChanged?.();
  }
  // Series total = sum of every game's score (current total if unfinished);
  // average = mean of completed games only.
  const seriesTotal = games.reduce(
    (sum, g) => sum + (g.final_score ?? calculateGameScore(g.frames).total),
    0
  );
  const completed = games.flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
  const seriesAvg = completed.length
    ? Math.round(completed.reduce((a, b) => a + b, 0) / completed.length)
    : null;

  return (
    <div className="relative">
    <button
      type="button"
      onClick={() => session.id && onOpen(session.id)}
      className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm ${
        isActive ? "border-felt-700 ring-1 ring-felt-700" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-950">{session.alley_name}</p>
          {session.description && (
            <p className="truncate text-xs font-medium text-slate-600">{session.description}</p>
          )}
          <p className="truncate text-xs text-slate-500">
            {[session.date, laneSummary(games), session.oil_pattern]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-7 text-right">
          {isActive && (
            <span className="inline-flex items-center rounded-full bg-felt-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Active
            </span>
          )}
          {seriesTotal > 0 && (
            <p className="text-lg font-extrabold leading-none text-felt-700">{seriesTotal}</p>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {games.length} {games.length === 1 ? "game" : "games"}
            {seriesAvg !== null && ` · ${seriesAvg} avg`}
          </p>
        </div>
      </div>

      {games.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {games.map((game) => {
            const score = calculateGameScore(game.frames);
            const display =
              game.final_score ?? (score.isComplete ? score.total : `${score.total}+`);
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

      <button
        type="button"
        onClick={() => setShowStats(true)}
        aria-label="Session stats"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <BarChart3 size={16} aria-hidden="true" />
      </button>

      {showStats && (
        <SessionLanePanel
          summary={summary}
          defaultTab="stats"
          // Close the panel first: it portals to body after the edit dialog,
          // so it would otherwise paint on top of it.
          onEdit={() => { setShowStats(false); setShowEdit(true); }}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Portal to body: rows can live inside SwipePanes, whose translateX
          transform would otherwise reposition this fixed dialog. */}
      {createPortal(
        <SessionFormDialog
          open={showEdit}
          title="Edit session"
          submitLabel="Save"
          initial={{
            alley_name: session.alley_name,
            date: session.date,
            description: session.description,
            oil_pattern_id: session.oil_pattern_id,
            general_notes: session.general_notes
          }}
          onSubmit={handleSaveEdit}
          onCancel={() => setShowEdit(false)}
        />,
        document.body
      )}
    </div>
  );
}
