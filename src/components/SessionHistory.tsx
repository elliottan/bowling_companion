import { plural, t } from "@lingui/core/macro";
import { History } from "lucide-react";
import { calculateGameScore } from "../lib/scoring";
import { laneSummary } from "../lib/sessionLabels";
import { alleyLabel } from "../lib/sessionLabels";
import type { SessionSummary } from "../types/bowling";
import { GROUP_HEADING } from "./ui/typography";
import { LoadingCard } from "./ui/LoadingCard";
import { EmptyState } from "./ui/EmptyState";
import { SwipeRow } from "./ui/SwipeRow";
import { formatDayHeading, formatSessionDate } from "../lib/dates";
import { groupByDay } from "../lib/historyCalendar";
import { formatNumber } from "../lib/format";

interface SessionHistoryProps {
  sessions: SessionSummary[];
  isLoading?: boolean;
  /** `openStats` is set when every game in the session is finished. */
  onOpenSession: (sessionId: number, openStats?: boolean) => void;
  activeSessionId?: number | null;
  /** Asks to delete a session, from a row swiped aside (ADR-233). The caller
   *  confirms first. */
  onDeleteSession?: (summary: SessionSummary) => void;
}

export function SessionHistory({
  sessions,
  isLoading = false,
  onOpenSession,
  activeSessionId,
  onDeleteSession
}: SessionHistoryProps) {
  if (isLoading) return <LoadingCard />;

  if (sessions.length === 0) {
    return (
      <EmptyState icon={History} title={t`No sessions yet`} />
    );
  }

  // Under a heading per day (ADR-252), so a row no longer repeats its date.
  // The heading carries the day's key, which the calendar scrolls to.
  return (
    <div className="space-y-4">
      {groupByDay(sessions).map(({ date, sessions: day }) => (
        <section key={date} data-day={date} aria-label={formatSessionDate(date)}>
          <h2 className={`${GROUP_HEADING} mb-1.5 px-1`}>{formatDayHeading(date)}</h2>
          <ul className="space-y-2">
            {day.map((summary) => (
              <li key={summary.session.id}>
                {/* The session being scored is open in the Score tab, so it is
                    deleted from there, not from under it. */}
                <SwipeRow
                  className="rounded-lg"
                  actionLabel={t`Delete`}
                  disabled={!onDeleteSession || (summary.session.id != null && summary.session.id === activeSessionId)}
                  onAction={() => onDeleteSession?.(summary)}
                >
                  <SessionRow
                    summary={summary}
                    isActive={summary.session.id != null && summary.session.id === activeSessionId}
                    onOpen={onOpenSession}
                  />
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface SessionRowProps {
  summary: SessionSummary;
  isActive: boolean;
  onOpen: (sessionId: number, openStats?: boolean) => void;
}

/**
 * Tap a row to open the session, and that is all a tap does. Editing and
 * deleting the session are in its own editor, a tap on its header away: a
 * long press here was found by accident, mid-scroll, more than on purpose
 * (ADR-184). A swipe left shows Delete, which asks before it deletes
 * (ADR-233).
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
      aria-label={t`Open session: ${{ alley: alleyLabel(session.alley_name) }}, ${{ date: formatSessionDate(session.date) }}`}
      onClick={() => {
        if (session.id) onOpen(session.id, !hasUnfinishedGame);
      }}
      className={`w-full rounded-lg border bg-surface p-4 text-left shadow-sm ${
        isActive ? "border-accent-fill ring-1 ring-accent-fill" : "border-edge"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Whole, on as many lines as it takes: the alley and the event are
              how a bowler finds a night, and they used to be cut at two lines,
              which a long name ("Chinese Swimming Club Bowling Centre") at a
              large text size outran. */}
          <p className="break-words font-semibold text-ink">
            {alleyLabel(session.alley_name)}
          </p>
          {session.description && (
            <p className="break-words text-xs font-medium text-ink-secondary">{session.description}</p>
          )}
          {/* The day is the heading above; the lanes stay. */}
          {laneSummary(games) && <p className="text-xs text-ink-secondary">{laneSummary(games)}</p>}
          {session.oil_pattern && (
            <p className="text-xs font-medium text-ink-secondary">{session.oil_pattern}</p>
          )}
        </div>
        {/* At most half the card, so a large text size wraps the series under
            the game count instead of squeezing the alley to a word a line. */}
        <div className="flex max-w-[50%] flex-col items-end gap-0.5 text-right">
          {hasUnfinishedGame && (
            <span className="inline-flex items-center rounded-full bg-accent-fill px-2 py-0.5 text-caption-2 font-bold uppercase tracking-wide text-accent-on-fill">
              {t({ message: "Active", comment: "Badge on a session that still has a game in progress." })}
            </span>
          )}
          {/* The average leads (ADR-152). Until a game is finished there is
              none, and the running series stands in for it. */}
          {(seriesAvg !== null || seriesTotal > 0) && (
            <p className="whitespace-nowrap text-lg font-extrabold leading-none text-accent">
              {formatNumber(seriesAvg ?? seriesTotal)}
              {seriesAvg !== null && <span className="ml-1 text-xs font-semibold text-ink-secondary">{t({ message: "avg", comment: "Short for average, beside a session's average score." })}</span>}
            </p>
          )}
          <p className={`${GROUP_HEADING} flex flex-wrap justify-end gap-x-1`}>
            <span className="whitespace-nowrap">
              {plural(games.length, { one: "# game", other: "# games" })}
            </span>
            {seriesAvg !== null && games.length > 1 && (
              <span className="whitespace-nowrap">
                {" · "}
                {t({ message: `${{ total: seriesTotal }} series`, comment: "Bowling term: the total of every game in one session." })}
              </span>
            )}
          </p>
        </div>
      </div>

      {games.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {games.map((game) => {
            const score = calculateGameScore(game.frames);
            const display =
              game.final_score ?? (score.isComplete ? score.total : `${formatNumber(score.total)}+`);
            return (
              <span
                key={game.id}
                className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-strong"
              >
                <span className="text-ink-secondary">{t({ message: `G${{ game: game.game_number }}`, comment: "Short for Game, with its number: G1, G2." })}</span>
                <span className="text-accent">{typeof display === "number" ? formatNumber(display) : display}</span>
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
                <dt className="shrink-0 font-semibold">{t({ message: `G${{ game: game.game_number }}`, comment: "Short for Game, with its number: G1, G2." })}</dt>
                <dd className="min-w-0 truncate">{game.notes}</dd>
              </div>
            ))}
        </dl>
      )}
    </button>
  );
}
