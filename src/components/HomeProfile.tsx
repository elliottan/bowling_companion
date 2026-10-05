import { ChevronRight, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/Button";
import { BowlingBallIcon, LanePairIcon, OilPatternIcon, SpareLineIcon } from "./icons";
import { CatalogBallImage } from "./CatalogBallImage";
import { GROUP_HEADING } from "./ui/typography";
import { TAP_TARGET_44 } from "./ui/Chip";
import { calculateGameScore } from "../lib/scoring";
import { formatSessionDate } from "../lib/dates";
import { alleyLabel } from "../lib/sessionLabels";
import type { Ball, SessionSummary } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";

/**
 * A strip that scrolls sideways, bled to the screen edge so a tile cut off at
 * the edge says there is more. `py-1`, not `pb-1`: overflow-x-auto forces
 * overflow-y to auto, which would clip a tile's shadow at the top.
 */
const STRIP = "-mx-3 flex gap-2 overflow-x-auto overscroll-x-contain px-3 py-1 sm:-mx-6 sm:px-6";

/**
 * The heading over a row of the profile, which is itself the way into the
 * place the row previews (DESIGN-LANGUAGE §4b: a heading opens what it counts).
 */
function RowHeading({
  label,
  detail,
  onClick,
  trailing
}: {
  label: string;
  detail?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-1 flex min-h-8 items-center justify-between gap-3 px-1">
      <h2 className={GROUP_HEADING}>
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={`relative inline-flex items-center gap-1 uppercase active:opacity-60 ${TAP_TARGET_44}`}
          >
            {label}
            {detail && <span className="font-normal normal-case text-ink-tertiary">· {detail}</span>}
            <ChevronRight size={14} aria-hidden="true" className="text-ink-tertiary" />
          </button>
        ) : (
          label
        )}
      </h2>
      {trailing}
    </div>
  );
}

interface ArsenalStripProps {
  balls: Ball[] | undefined;
  onOpenArsenal: () => void;
}

/**
 * The arsenal as a row of its balls. The pictures are the colour on Home: a
 * count of balls says how many, the balls themselves say which.
 */
export function ArsenalStrip({ balls, onOpenArsenal }: ArsenalStripProps) {
  const count = balls?.length;
  return (
    <section>
      <RowHeading
        label="Arsenal"
        detail={count ? `${count} ${count === 1 ? "ball" : "balls"}` : undefined}
        onClick={onOpenArsenal}
      />
      {balls === undefined ? (
        <div className="h-16" />
      ) : balls.length === 0 ? (
        <button
          type="button"
          onClick={onOpenArsenal}
          className="flex h-16 w-full items-center gap-3 rounded-xl border border-dashed border-edge-strong bg-surface px-3 text-left active:bg-surface-muted"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Plus size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-ink">Add the balls you throw</span>
        </button>
      ) : (
        <ul className={STRIP} aria-label="Balls in your arsenal">
          {balls.map((ball) => (
            <li key={ball.id} className="shrink-0">
              <button
                type="button"
                onClick={onOpenArsenal}
                aria-label={ball.name}
                title={ball.name}
                className="block h-14 w-14 rounded-xl active:opacity-70"
              >
                {ball.catalog_snapshot ? (
                  <CatalogBallImage
                    src={ball.catalog_snapshot.imageThumb}
                    alt=""
                    brand={ball.catalog_snapshot.brand as Manufacturer}
                    size="thumb"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-lg bg-surface-muted text-ink-tertiary">
                    <BowlingBallIcon size={24} aria-hidden="true" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({
  icon: Icon,
  label,
  detail,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-edge bg-surface p-2.5 text-left shadow-sm active:bg-surface-muted"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="block w-full min-w-0">
        <span className="block whitespace-nowrap text-sm font-semibold tracking-tight text-ink">
          {label}
        </span>
        <span className="block truncate text-xs text-ink-secondary">{detail ?? " "}</span>
      </span>
    </button>
  );
}

interface ProfileTilesProps {
  spareLines?: number;
  laneNotes?: number;
  oilPatterns?: number;
  onOpenSpareLines: () => void;
  onOpenLaneNotes: () => void;
  onOpenOilPatterns: () => void;
}

/** "3 leaves", or the word for none. Undefined while the count is loading. */
function counted(n: number | undefined, one: string, many: string): string | undefined {
  if (n == null) return undefined;
  return n === 0 ? "None yet" : `${n} ${n === 1 ? one : many}`;
}

/** The three other things a bowler keeps, side by side as equal tiles. */
export function ProfileTiles({
  spareLines,
  laneNotes,
  oilPatterns,
  onOpenSpareLines,
  onOpenLaneNotes,
  onOpenOilPatterns
}: ProfileTilesProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile
        icon={SpareLineIcon}
        label="Spare lines"
        detail={counted(spareLines, "leave", "leaves")}
        onClick={onOpenSpareLines}
      />
      <Tile
        icon={LanePairIcon}
        label="Lane notes"
        detail={counted(laneNotes, "note", "notes")}
        onClick={onOpenLaneNotes}
      />
      <Tile
        icon={OilPatternIcon}
        label="Oil patterns"
        detail={counted(oilPatterns, "pattern", "patterns")}
        onClick={onOpenOilPatterns}
      />
    </div>
  );
}

/** Games in a session, and the mean of the finished ones. */
function sessionTileFacts(summary: SessionSummary): {
  games: number;
  average: number | null;
  inProgress: boolean;
} {
  const { games } = summary;
  const finished = games.flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
  return {
    games: games.length,
    average: finished.length
      ? Math.round(finished.reduce((a, b) => a + b, 0) / finished.length)
      : null,
    inProgress: games.some(
      (g) => g.final_score === undefined && !calculateGameScore(g.frames).isComplete
    )
  };
}

function SessionTile({
  summary,
  isActive,
  onOpen
}: {
  summary: SessionSummary;
  isActive: boolean;
  onOpen: (sessionId: number, openStats?: boolean) => void;
}) {
  const { session } = summary;
  const { games, average, inProgress } = sessionTileFacts(summary);
  const alley = alleyLabel(session.alley_name);
  const event = session.description?.trim();
  const date = formatSessionDate(session.date);
  const tally = [
    `${games} ${games === 1 ? "game" : "games"}`,
    average !== null ? `${average} avg` : inProgress ? "In progress" : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      aria-label={`Open session: ${alley}, ${date}`}
      onClick={() => session.id && onOpen(session.id, !inProgress)}
      className={`flex h-full w-40 flex-col rounded-xl border bg-surface p-3 text-left shadow-sm active:bg-surface-muted ${
        isActive ? "border-accent-fill ring-1 ring-accent-fill" : "border-edge"
      }`}
    >
      <span className="block w-full truncate text-sm font-semibold text-ink">{event || alley}</span>
      {event && <span className="block w-full truncate text-xs text-ink-secondary">{alley}</span>}
      <span className="block w-full truncate text-xs text-ink-secondary">{date}</span>
      <span className="mt-auto block w-full truncate pt-2 text-xs font-semibold tabular-nums text-ink">
        {tally}
      </span>
    </button>
  );
}

interface RecentSessionStripProps {
  sessions: SessionSummary[];
  activeSessionId?: number | null;
  onOpenSession: (sessionId: number, openStats?: boolean) => void;
  /** More sessions than the row shows, so History is offered. */
  hasMore: boolean;
  onViewAll: () => void;
}

/** The latest sessions as one sideways row. History holds every one of them,
 *  with the games and the lanes; the tile is enough to find last week's. */
export function RecentSessionStrip({
  sessions,
  activeSessionId,
  onOpenSession,
  hasMore,
  onViewAll
}: RecentSessionStripProps) {
  return (
    <section>
      <RowHeading
        label="Recent sessions"
        trailing={
          hasMore && (
            <Button variant="ghost" onClick={onViewAll}>
              All in History
            </Button>
          )
        }
      />
      <ul className={STRIP} aria-label="Recent sessions">
        {sessions.map((summary) => (
          <li key={summary.session.id} className="shrink-0">
            <SessionTile
              summary={summary}
              isActive={summary.session.id != null && summary.session.id === activeSessionId}
              onOpen={onOpenSession}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
