import { History, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { calculateGameScore } from "../lib/scoring";
import type { SessionSummary } from "../types/bowling";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  onOpenSession: (sessionId: number) => void;
  onRequestDelete: (sessionId: number, label: string) => void;
  activeSessionId?: number | null;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  onRequestDelete,
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
      {sessions.map((summary) => (
        <li key={summary.session.id}>
          <SwipeRow
            summary={summary}
            isActive={summary.session.id != null && summary.session.id === activeSessionId}
            onOpen={onOpenSession}
            onRequestDelete={onRequestDelete}
          />
        </li>
      ))}
    </ul>
  );
}

const REVEAL = 88; // px the card slides left to expose the delete action

/** Distinct lanes across a session's games, e.g. "Lane 9 / 10". */
function laneSummary(games: SessionSummary["games"]): string {
  const lanes = new Set<string>();
  for (const g of games) {
    const list = g.lanes ?? (g.lane_number ? [g.lane_number] : []);
    for (const l of list) if (l) lanes.add(l);
  }
  return lanes.size ? `Lane ${[...lanes].join(" / ")}` : "";
}

interface SwipeRowProps {
  summary: SessionSummary;
  isActive: boolean;
  onOpen: (sessionId: number) => void;
  onRequestDelete: (sessionId: number, label: string) => void;
}

function SwipeRow({ summary, isActive, onOpen, onRequestDelete }: SwipeRowProps) {
  const { session, games } = summary;
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
  const [offset, setOffset] = useState(0); // 0 = closed, -REVEAL = open
  const startX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    dragging.current = true;
    moved.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current + (offset === -REVEAL ? -REVEAL : 0);
    if (Math.abs(e.clientX - startX.current) > 8) moved.current = true;
    setOffset(Math.max(-REVEAL, Math.min(0, dx)));
  }
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    setOffset((o) => (o <= -REVEAL / 2 ? -REVEAL : 0));
  }
  function handleClick() {
    // A swipe shouldn't also open the session; an open row closes on tap.
    if (moved.current) return;
    if (offset !== 0) {
      setOffset(0);
      return;
    }
    if (session.id) onOpen(session.id);
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete action revealed behind the card */}
      <button
        type="button"
        aria-label={`Delete ${session.alley_name} session`}
        onClick={() => session.id && onRequestDelete(session.id, session.alley_name)}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-red-600 text-white"
      >
        <Trash2 size={20} aria-hidden="true" />
      </button>

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClick={handleClick}
        style={{ transform: `translateX(${offset}px)`, transition: dragging.current ? "none" : "transform 150ms ease" }}
        className={`relative w-full touch-pan-y rounded-lg border bg-white p-4 text-left shadow-sm ${
          isActive
            ? "border-felt-700 ring-1 ring-felt-700"
            : "border-slate-200"
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
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
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
    </div>
  );
}
