import { History, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { calculateGameScore } from "../lib/scoring";
import { useLongPress } from "../lib/useLongPress";
import { deleteSession, updateSession } from "../services/bowlingRepository";
import { ConfirmDialog } from "./ConfirmDialog";
import { SessionFormDialog } from "./SessionFormDialog";
import type { NewSessionFormValues } from "./SessionForm";
import type { SessionSummary } from "../types/bowling";
import { GROUP_HEADING } from "./ui/typography";
import { EmptyState } from "./ui/EmptyState";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  /** `openStats` is set when every game in the session is finished. */
  onOpenSession: (sessionId: number, openStats?: boolean) => void;
  activeSessionId?: number | null;
  /** Called after a session is edited or deleted so the list can reload. */
  /** Called after a session is deleted so App can drop stale active state. */
  onSessionDeleted?: (sessionId: number) => void;
  /** Way out of the empty state. Omitted where the screen has no start control
   *  of its own, in which case the copy points at the one that does. */
  emptyAction?: ReactNode;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId,
  onSessionDeleted,
  emptyAction
}: SessionHistoryProps) {
  if (isLoading) {
    return (
      <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-ink-secondary shadow-sm">
        Loading…
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No sessions yet"
        description={
          emptyAction
            ? "A session is one trip to the alley. Start one and every game, lane and ball you use lands here."
            : "Sessions you bowl show up here. Start your first one from the Home tab."
        }
      >
        {emptyAction}
      </EmptyState>
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
  onOpen: (sessionId: number, openStats?: boolean) => void;
  onSessionDeleted?: (sessionId: number) => void;
}

/**
 * Tap a row to open the session; edit lives in the stats panel's pencil;
 * long-press the row to delete the session.
 */
function SessionRow({ summary, isActive, onOpen, onSessionDeleted }: SessionRowProps) {
  const { session, games } = summary;
  const [showEdit, setShowEdit] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ left: number; top: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const longPress = useLongPress();

  async function handleSaveEdit(values: NewSessionFormValues) {
    if (!session.id) return;
    await updateSession(session.id, values);
    setShowEdit(false);
  }

  async function handleDeleteSession() {
    setConfirmDelete(false);
    if (!session.id) return;
    await deleteSession(session.id);
    // Still announced: the lists refresh themselves now, but the shell has to
    // drop the session it may be holding open (ADR-041 navigation state).
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
        if (session.id) onOpen(session.id, !hasUnfinishedGame);
      }}
      className={`w-full rounded-lg border bg-surface p-4 text-left shadow-sm ${
        isActive ? "border-accent-fill ring-1 ring-accent-fill" : "border-edge"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold text-ink">
            {session.alley_name}
          </p>
          {session.description && (
            <p className="truncate text-xs font-medium text-ink-secondary">{session.description}</p>
          )}
          <p className="text-xs text-ink-secondary">
            {[session.date, laneSummary(games)].filter(Boolean).join(" · ")}
          </p>
          {session.oil_pattern && (
            <p className="text-xs font-medium text-ink-secondary">{session.oil_pattern}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {hasUnfinishedGame && (
            <span className="inline-flex items-center rounded-full bg-accent-fill px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-on-fill">
              Active
            </span>
          )}
          {seriesTotal > 0 && (
            <p className="text-lg font-extrabold leading-none text-accent">{seriesTotal}</p>
          )}
          <p className={GROUP_HEADING}>
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
                className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-strong"
              >
                <span className="text-ink-secondary">G{game.game_number}</span>
                <span className="text-accent">{display}</span>
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
              <div key={game.id} className="flex gap-1.5 text-xs text-ink-secondary">
                <dt className="shrink-0 font-semibold">G{game.game_number}</dt>
                <dd className="min-w-0 truncate">{game.notes}</dd>
              </div>
            ))}
        </dl>
      )}
    </button>

      {/* Long-press menu + confirm are portaled to body: rows can live inside
          SwipePanes, whose translateX transform would otherwise reposition
          these fixed overlays. */}
      {rowMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-10" onClick={() => setRowMenu(null)} />
            <div
              className="fixed z-20 w-44 overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-lg"
              style={{ left: rowMenu.left, top: rowMenu.top }}
            >
              <button
                type="button"
                onClick={() => {
                  setRowMenu(null);
                  setShowEdit(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-muted"
              >
                <Pencil size={16} aria-hidden="true" />
                Edit session
              </button>
              <button
                type="button"
                onClick={() => {
                  setRowMenu(null);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-danger-700 hover:bg-danger-50"
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
