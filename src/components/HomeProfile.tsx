import { Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BowlingBallIcon, GamePlanIcon, LanePairIcon, SpareLineIcon } from "./icons";
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
const STRIP = "-mx-3 flex gap-2 overflow-x-auto overscroll-x-none px-3 py-1 sm:-mx-6 sm:px-6";

/** The heading over a row of the profile, with room for one small action. */
function RowHeading({ label, trailing }: { label: string; trailing?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3 px-4">
      <h2 className={GROUP_HEADING}>{label}</h2>
      {trailing}
    </div>
  );
}

interface ArsenalGridProps {
  balls: Ball[] | undefined;
  onOpenArsenal: () => void;
}

/** Two rows of four: as many balls as sit beside the greeting at full size. */
const ARSENAL_SLOTS = 8;

/**
 * The arsenal as its balls, beside the greeting. The pictures are the color on
 * Home: a count of balls says how many, the balls themselves say which.
 *
 * It fills row by row and does not scroll. A scroller inside the top band of
 * the screen would be a second scroll axis under the thumb for a preview whose
 * job is only to say "these are yours"; the full list is one tap away. A bag
 * that holds more than the grid shows its overflow as a count in the last slot.
 * No heading and no total: the balls say what the grid is, and the count in
 * the last slot is the only number it needs.
 */
export function ArsenalGrid({ balls, onOpenArsenal }: ArsenalGridProps) {
  const count = balls?.length ?? 0;
  const overflow = count > ARSENAL_SLOTS;
  const shown = balls ? balls.slice(0, overflow ? ARSENAL_SLOTS - 1 : ARSENAL_SLOTS) : [];
  return (
    <section aria-label="Arsenal">
      {balls === undefined ? (
        <div className="aspect-[2/1]" />
      ) : balls.length === 0 ? (
        <button
          type="button"
          onClick={onOpenArsenal}
          className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-edge-strong bg-surface px-3 text-center active:bg-surface-muted"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Plus size={18} aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold text-ink">Add the balls you throw</span>
        </button>
      ) : (
        <ul className="grid grid-cols-4 gap-1.5" aria-label="Your arsenal">
          {shown.map((ball) => (
            <li key={ball.id}>
              <button
                type="button"
                onClick={onOpenArsenal}
                aria-label={ball.name}
                title={ball.name}
                className="block aspect-square w-full rounded-full active:opacity-70"
              >
                {ball.catalog_snapshot ? (
                  <CatalogBallImage
                    src={ball.catalog_snapshot.imageThumb}
                    alt=""
                    brand={ball.catalog_snapshot.brand as Manufacturer}
                    size="thumb"
                    bare
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-ink-tertiary">
                    <BowlingBallIcon size={20} aria-hidden="true" />
                  </span>
                )}
              </button>
            </li>
          ))}
          {overflow && (
            <li>
              <button
                type="button"
                onClick={onOpenArsenal}
                aria-label={`${count - shown.length} more balls`}
                className="flex aspect-square w-full items-center justify-center rounded-full bg-accent-soft text-sm font-bold tabular-nums text-accent active:opacity-70"
              >
                +{count - shown.length}
              </button>
            </li>
          )}
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
      // A square button, drawn as iOS draws one (ADR-191): everything on one
      // centre line, the icon bare above the name, deep corners, no outline.
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-[22px] bg-surface px-2 pb-3 pt-4 text-center active:bg-surface-muted"
    >
      <Icon size={24} aria-hidden="true" className="text-accent" />
      <span className="block w-full min-w-0">
        <span className="block whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">
          {label}
        </span>
        {/* Two lines, not one: an empty tile says what it is for, and that
            is a short sentence rather than a count. */}
        <span className="line-clamp-2 block text-xs text-ink-secondary">{detail ?? " "}</span>
      </span>
    </button>
  );
}

interface ProfileTilesProps {
  spareLines?: number;
  laneNotes?: number;
  /** Alleys the bowler has bowled at, which is what the Alley report reads. */
  alleys?: number;
  onOpenSpareLines: () => void;
  onOpenLaneNotes: () => void;
  onOpenAlleyReport: () => void;
}

/**
 * "3 leaves", or what the tile is for while it holds nothing. "None yet" under
 * "Alley report" told a new bowler it was empty and nothing about what would
 * fill it. Undefined while the count is loading.
 */
function counted(
  n: number | undefined,
  one: string,
  many: string,
  empty: string
): string | undefined {
  if (n == null) return undefined;
  return n === 0 ? empty : `${n} ${n === 1 ? one : many}`;
}

/** The three other things that are the bowler's own, side by side as equal
 *  tiles. The Alley report sits here rather than with the tools: it reads
 *  nothing but this bowler's games (ADR-146). */
export function ProfileTiles({
  spareLines,
  laneNotes,
  alleys,
  onOpenSpareLines,
  onOpenLaneNotes,
  onOpenAlleyReport
}: ProfileTilesProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile
        icon={SpareLineIcon}
        label="Spare lines"
        detail={counted(spareLines, "leave", "leaves", "Where you shoot each spare")}
        onClick={onOpenSpareLines}
      />
      <Tile
        icon={LanePairIcon}
        label="Lane notes"
        detail={counted(laneNotes, "note", "notes", "How each lane plays")}
        onClick={onOpenLaneNotes}
      />
      <Tile
        icon={GamePlanIcon}
        label="Alley report"
        detail={counted(alleys, "alley", "alleys", "Your numbers at each alley")}
        onClick={onOpenAlleyReport}
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

  return (
    <button
      type="button"
      aria-label={`Open session: ${alley}, ${date}`}
      onClick={() => session.id && onOpen(session.id, !inProgress)}
      className={`flex h-full w-40 flex-col rounded-[22px] bg-surface px-3.5 py-3 text-left active:bg-surface-muted ${
        isActive ? "ring-2 ring-inset ring-accent-fill" : ""
      }`}
    >
      <span className="block w-full truncate text-sm font-semibold text-ink">{event || alley}</span>
      {event && <span className="block w-full truncate text-xs text-ink-secondary">{alley}</span>}
      <span className="block w-full truncate text-xs text-ink-secondary">{date}</span>
      {/* The average leads, in the accent: it is the number a bowler looks
          for. The game count rides beside it, smaller, as its context. */}
      <span className="mt-auto flex w-full items-baseline gap-1 pt-2 tabular-nums">
        {average !== null ? (
          <>
            <span className="text-lg font-bold leading-none text-accent">{average}</span>
            <span className="text-[10px] font-bold tracking-wide text-accent">AVG</span>
          </>
        ) : inProgress ? (
          <span className="text-xs font-semibold text-accent">In progress</span>
        ) : null}
        <span className="truncate text-[10px] font-semibold tracking-wide text-ink-secondary">
          ({games} {games === 1 ? "GM" : "GMS"})
        </span>
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
            <button
              type="button"
              onClick={onViewAll}
              className={`relative text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              View all
            </button>
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
