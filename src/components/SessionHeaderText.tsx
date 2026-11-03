import { alleyLabel, sessionMetaLine } from "../lib/sessionLabels";
import type { SessionSummary } from "../types/bowling";

/**
 * The session's identity: the alley, then the event, the date and the oil
 * pattern. The pattern is a link where it has a sheet; a caller that makes the
 * block tappable gets the link's `stopPropagation`, so tapping the pattern
 * opens the pattern and not the block.
 *
 * Three sizes (ADR-226):
 * - `page`, a pushed session's large title: the alley large, and every line
 *   wrapped whole, however long the bowler's alley or event is.
 * - `bar`, the same screen's bar once that has scrolled away: the alley alone,
 *   on one line, cut, as iOS draws a title in a bar. The line under it stays
 *   on the page, where a short page that scrolls only part way still shows it.
 * - `row`, the Score tab, where the identity heads the page beside its
 *   actions: the alley wraps as far as it needs, the line under it is cut.
 */
export function SessionHeaderText({
  session,
  heading: Heading = "h1",
  variant = "row"
}: {
  session: SessionSummary["session"];
  /** `h1` as a pushed screen's title, `h2` heading the Score tab's page, `p`
   *  for the bar's copy of a heading that is on the page. */
  heading?: "h1" | "h2" | "p";
  variant?: "page" | "bar" | "row";
}) {
  const meta = sessionMetaLine(session);
  const name =
    variant === "page"
      ? "text-title-2 font-bold leading-tight text-ink hyphens-auto break-words"
      : variant === "bar"
        ? "truncate text-body font-semibold leading-tight text-ink"
        : "break-words text-body font-semibold leading-tight text-ink";
  const line = variant === "page" ? "mt-0.5 text-sm text-ink-secondary" : "truncate text-xs leading-tight text-ink-secondary";
  return (
    <div className="min-w-0">
      <Heading data-title-name={variant === "page" ? "" : undefined} className={name}>
        {alleyLabel(session.alley_name)}
      </Heading>
      {variant !== "bar" && (meta || session.oil_pattern) && (
        // Cut to one line in a bar and beside the Score tab's actions, as iOS
        // cuts a subtitle: the event, date and pattern are the bowler's own
        // and can be any length (ADR-225). Whole at the top of the page.
        <p data-fit={variant === "page" ? undefined : "exempt"} className={line}>
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
