import { Pencil } from "lucide-react";
import { formatSessionDate } from "../lib/dates";
import type { SessionSummary } from "../types/bowling";

/** One game's lanes: "Lanes 9/10", or "Lane 5" when it was played on one. */
export function laneLabel(lanes: string[]): string {
  const played = lanes.filter(Boolean);
  if (!played.length) return "";
  return `${played.length > 1 ? "Lanes" : "Lane"} ${played.join("/")}`;
}

// Lanes are per-game, so show each distinct lane PAIR bowled this session,
// e.g. "Lanes 9/10, 11/12" (or "Lane 5" for a single-lane game).
export function laneSummary(games: SessionSummary["games"]): string {
  const pairs: string[] = [];
  for (const g of games) {
    const lanes = (g.lanes ?? (g.lane_number ? [g.lane_number] : [])).filter(Boolean);
    if (!lanes.length) continue;
    const label = lanes.join("/");
    if (!pairs.includes(label)) pairs.push(label);
  }
  if (!pairs.length) return "";
  const noun = pairs.length === 1 && pairs[0].includes("/") ? "Lanes" : pairs.length > 1 ? "Lanes" : "Lane";
  return `${noun} ${pairs.join(", ")}`;
}

/**
 * Session identity block, alley, event/date/games, lanes/oil pattern. Shared
 * by the score-entry header and the session sheet so both read identically.
 * The oil pattern is a link; callers that make the whole block tappable get a
 * `stopPropagation` on it so tapping the pattern opens the sheet, not the block.
 */
export function SessionHeaderText({
  session,
  games,
  onEdit
}: {
  session: SessionSummary["session"];
  games: SessionSummary["games"];
  /** Renders a pencil button beside the alley name. */
  onEdit?: () => void;
}) {
  const lanes = laneSummary(games);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <h2 className="truncate text-base font-bold text-ink">{session.alley_name}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit session"
            className="shrink-0 rounded p-1 text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Two rows: event/date/games, then lanes + pattern, the pattern name is
          long, so it gets a row where it won't be truncated. */}
      <p className="truncate text-xs text-ink-secondary">
        {[session.description, formatSessionDate(session.date), `${games.length} ${games.length === 1 ? "game" : "games"}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {(lanes || session.oil_pattern) && (
        <p className="truncate text-xs text-ink-secondary">
          {lanes}
          {session.oil_pattern && (
            <>
              {lanes && " · "}
              {/* The pattern sheet is worth a tap mid-session, so link it here. */}
              {session.oil_pattern_url ? (
                <a
                  href={session.oil_pattern_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-accent underline underline-offset-2"
                >
                  {session.oil_pattern}
                </a>
              ) : (
                session.oil_pattern
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}
