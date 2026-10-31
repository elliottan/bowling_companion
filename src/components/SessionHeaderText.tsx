import { plural } from "@lingui/core/macro";
import { formatShortDate } from "../lib/dates";
import { alleyLabel } from "../lib/sessionLabels";
import type { SessionSummary } from "../types/bowling";

/** One game's lanes: "Lanes 9/10", or "Lane 5" when it was played on one. */
export function laneLabel(all: string[]): string {
  const played = all.filter(Boolean);
  if (!played.length) return "";
  const lanes = played.join("/");
  return plural(played.length, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` });
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
  const lanes = pairs.join(", ");
  // One pair of lanes is plural too ("Lanes 9/10"); only a lone lane is singular.
  const count = pairs.length === 1 && !pairs[0].includes("/") ? 1 : 2;
  return plural(count, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` });
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
      {/* Two lines before it is cut: the series beside it is wider in some
          languages, and an alley's name is the one thing here it must show. */}
      <Heading className="line-clamp-2 break-words text-body font-semibold leading-tight text-ink">
        {alleyLabel(session.alley_name)}
      </Heading>
      {(meta || session.oil_pattern) && (
        // One line in a bar, as iOS cuts a subtitle: the event, date and
        // pattern are the bowler's own and can be any length (ADR-225).
        <p data-fit="exempt" className="truncate text-xs leading-tight text-ink-secondary">
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
