import { History } from "lucide-react";
import { calculateGameScore } from "../lib/scoring";
import { laneSummary } from "./SessionHeaderText";
import { alleyLabel } from "../lib/sessionLabels";
import type { SessionSummary } from "../types/bowling";
import { GROUP_HEADING } from "./ui/typography";
import { LoadingCard } from "./ui/LoadingCard";
import { EmptyState } from "./ui/EmptyState";
import { formatSessionDate } from "../lib/dates";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  /** `openStats` is set when every game in the session is finished. */
  onOpenSession: (sessionId: number, openStats?: boolean) => void;
  activeSessionId?: number | null;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId
}: SessionHistoryProps) {
  if (isLoading) return <LoadingCard />;

  if (sessions.length === 0) {
    return (
      <EmptyState icon={History} title="No sessions yet" />
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
          />
        </li>
      ))}
    </ul>
  );
}

interface SessionRowProps {
  summary: SessionSummary;
  isActive: boolean;
  onOpen: (sessionId: number, openStats?: boolean) => void;
}

/**
 * Tap a row to open the session, and that is all a row does. Editing and
 * deleting the session are in its own editor, a tap on its header away: a
 * long press here was found by accident, mid-scroll, more than on purpose
 * (ADR-184).
 */
function SessionRow({ summary, isActive, onOpen }: SessionRowProps) {
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
  // "Active" = the session still has a game in progress, not merely the one
  // most recently opened (that's the border highlight via isActive).
  const hasUnfinishedGame = games.some(
    (g) => g.final_score === undefined && !calculateGameScore(g.frames).isComplete
  );

  return (
    <button
      type="button"
      aria-label={`Open session: ${alleyLabel(session.alley_name)}, ${formatSessionDate(session.date)}`}
      onClick={() => {
        if (session.id) onOpen(session.id, !hasUnfinishedGame);
      }}
      className={`w-full rounded-lg border bg-surface p-4 text-left shadow-sm ${
        isActive ? "border-accent-fill ring-1 ring-accent-fill" : "border-edge"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-semibold text-ink">
            {alleyLabel(session.alley_name)}
          </p>
          {session.description && (
            <p className="line-clamp-2 break-words text-xs font-medium text-ink-secondary">{session.description}</p>
          )}
          <p className="text-xs text-ink-secondary">
            {[formatSessionDate(session.date), laneSummary(games)].filter(Boolean).join(" · ")}
          </p>
          {session.oil_pattern && (
            <p className="text-xs font-medium text-ink-secondary">{session.oil_pattern}</p>
          )}
        </div>
        {/* At most half the card, so a large text size wraps the series under
            the game count instead of squeezing the alley to a word a line. */}
        <div className="flex max-w-[50%] flex-col items-end gap-0.5 text-right">
          {hasUnfinishedGame && (
            <span className="inline-flex items-center rounded-full bg-accent-fill px-2 py-0.5 text-caption-2 font-bold uppercase tracking-wide text-accent-on-fill">
              Active
            </span>
          )}
          {/* The average leads (ADR-152). Until a game is finished there is
              none, and the running series stands in for it. */}
          {(seriesAvg !== null || seriesTotal > 0) && (
            <p className="whitespace-nowrap text-lg font-extrabold leading-none text-accent">
              {seriesAvg ?? seriesTotal}
              {seriesAvg !== null && <span className="ml-1 text-xs font-semibold text-ink-secondary">avg</span>}
            </p>
          )}
          <p className={`${GROUP_HEADING} flex flex-wrap justify-end gap-x-1`}>
            <span className="whitespace-nowrap">
              {games.length} {games.length === 1 ? "game" : "games"}
            </span>
            {seriesAvg !== null && games.length > 1 && (
              <span className="whitespace-nowrap">{` · ${seriesTotal} series`}</span>
            )}
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
  );
}
