import { formatShortDate } from "../lib/dates";
import { alleyLabel } from "../lib/sessionLabels";
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

/** The line under the alley: the event and a short date. The game count is
 *  gone: the chips under the bar already say it, and the bar has the score and
 *  its actions to fit beside this. */
export function sessionMetaLine(session: SessionSummary["session"]): string {
  return [session.description, formatShortDate(session.date)].filter(Boolean).join(" · ");
}

/**
 * The session's identity as its bar draws it: the alley, then the event, the
 * date and the oil pattern. The pattern is a link where it has a sheet; a
 * caller that makes the block tappable gets the link's `stopPropagation`, so
 * tapping the pattern opens the pattern and not the block.
 */
export function SessionHeaderText({
  session,
  heading: Heading = "h1"
}: {
  session: SessionSummary["session"];
  /** `h1` as a pushed screen's title; `h2` heading the Score tab's page. */
  heading?: "h1" | "h2";
}) {
  const meta = sessionMetaLine(session);
  return (
    <div className="min-w-0">
      <Heading className="truncate text-body font-semibold leading-tight text-ink">
        {alleyLabel(session.alley_name)}
      </Heading>
      {(meta || session.oil_pattern) && (
        <p className="truncate text-xs leading-tight text-ink-secondary">
          {meta}
          {session.oil_pattern && (
            <>
              {meta && " · "}
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
