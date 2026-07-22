import { BarChart3, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { calculateGameScore } from "../lib/scoring";
import { useLongPress } from "../lib/useLongPress";
import { deleteSession, updateSession } from "../services/bowlingRepository";
import { ConfirmDialog } from "./ConfirmDialog";
import { SessionFormDialog } from "./SessionFormDialog";
import { SessionLanePanel } from "./SessionLanePanel";
import type { NewSessionFormValues } from "./SessionForm";
import type { SessionSummary } from "../types/bowling";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  onOpenSession: (sessionId: number) => void;
  activeSessionId?: number | null;
  /** Called after a session is edited or deleted so the list can reload. */
  onSessionChanged?: () => void;
  /** Called after a session is deleted so App can drop stale active state. */
  onSessionDeleted?: (sessionId: number) => void;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId,
  onSessionChanged,
  onSessionDeleted
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
            onSessionDeleted={onSessionDeleted}
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
  onSessionDeleted?: (sessionId: number) => void;
}

/**
 * Tap a row to open the session; edit lives in the stats panel's pencil;
 * long-press the row to delete the session.
 */
function SessionRow({ summary, isActive, onOpen, onSessionChanged, onSessionDeleted }: SessionRowProps) {
  const { session, games } = summary;
  const [showStats, setShowStats] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ left: number; top: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const longPress = useLongPress();

  async function handleSaveEdit(values: NewSessionFormValues) {
    if (!session.id) return;
    await updateSession(session.id, values);
    setShowEdit(false);
    onSessionChanged?.();
  }

  async function handleDeleteSession() {
    setConfirmDelete(false);
    if (!session.id) return;
    await deleteSession(session.id);
    onSessionChanged?.();
    onSessionDeleted?.(session.id);
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
  // "Active" = the session still has a game in progress — not merely the one
  // most recently opened (that's the border highlight via isActive).
  const hasUnfinishedGame = games.some(
    (g) => g.final_score === undefined && !calculateGameScore(g.frames).isComplete
  );

  return (
    <div className="relative">
    <button
      type="button"
      {...longPress.bind((row) => {
        const rect = row.getBoundingClientRect();
        setRowMenu({
          left: Math.max(8, Math.min(rect.left + 16, window.innerWidth - 200)),
          top: rect.top + Math.min(rect.height / 2, 48)
        });
      })}
      aria-label={`Open session: ${session.alley_name}, ${session.date}`}
      onClick={() => {
        if (longPress.didLongPress()) return;
        if (session.id) onOpen(session.id);
      }}
      className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm ${
        isActive ? "border-felt-700 ring-1 ring-felt-700" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold text-slate-950">
            {session.alley_name}
          </p>
          {session.description && (
            <p className="truncate text-xs font-medium text-slate-500">{session.description}</p>
          )}
          <p className="text-xs text-slate-500">
            {[session.date, laneSummary(games)].filter(Boolean).join(" · ")}
          </p>
          {session.oil_pattern && (
            <p className="text-xs font-medium text-slate-500">{session.oil_pattern}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 pr-9 text-right">
          {hasUnfinishedGame && (
            <span className="inline-flex items-center rounded-full bg-felt-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Active
            </span>
          )}
          {seriesTotal > 0 && (
            <p className="text-lg font-extrabold leading-none text-felt-700">{seriesTotal}</p>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
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
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary hover:bg-slate-100 hover:text-slate-700"
      >
        <BarChart3 size={16} aria-hidden="true" />
      </button>

      {/* Long-press menu + confirm are portaled to body: rows can live inside
          SwipePanes, whose translateX transform would otherwise reposition
          these fixed overlays. */}
      {rowMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-10" onClick={() => setRowMenu(null)} />
            <div
              className="fixed z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={{ left: rowMenu.left, top: rowMenu.top }}
            >
              <button
                type="button"
                onClick={() => {
                  setRowMenu(null);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete session
              </button>
            </div>
          </>,
          document.body
        )}

      {createPortal(
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this session?"
          message={`"${session.alley_name}" and all its games will be permanently deleted.`}
          onConfirm={handleDeleteSession}
          onCancel={() => setConfirmDelete(false)}
        />,
        document.body
      )}

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
