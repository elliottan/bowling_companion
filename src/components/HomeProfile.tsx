import { plural, t } from "@lingui/core/macro";
import { ChevronRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { BowlingBallIcon } from "./icons";
import { GamePlanArt, LaneNotesArt, SpareLinesArt } from "./ProfileTileArt";
import { CatalogBallImage } from "./CatalogBallImage";
import { formatNumber } from "../lib/format";
import type { HomeSummary } from "../lib/homeSummary";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";

/** Balls drawn overlapping on the arsenal row: enough to read as a bag. */
const ARSENAL_STACK = 5;

/**
 * The arsenal as one row that is plainly a button: a few of its balls
 * overlapping, its name and count, and a chevron (ADR-245). It used to be a
 * grid of balls beside the greeting with no name on it, which read as
 * decoration rather than a way into the arsenal.
 */
export function ArsenalRow({ balls, onOpenArsenal }: { balls: Ball[] | undefined; onOpenArsenal: () => void }) {
  const count = balls?.length ?? 0;
  const shown = (balls ?? []).slice(0, ARSENAL_STACK);
  const detail =
    balls === undefined
      ? "\u00a0"
      : count === 0
        ? t`Add balls to your bag`
        : t({ message: plural(count, { one: "# ball", other: "# balls" }), comment: "Bowling balls owned, in the bowler's bag" });
  return (
    <button
      type="button"
      onClick={onOpenArsenal}
      className="card-button flex min-h-[60px] w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left"
    >
      {count === 0 ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <BowlingBallIcon size={20} aria-hidden="true" />
        </span>
      ) : (
        <span className="flex shrink-0" aria-hidden="true">
          {shown.map((ball, i) => (
            <span
              key={ball.id}
              className={`h-9 w-9 shrink-0 rounded-full ring-2 ring-surface ${i > 0 ? "-ml-2.5" : ""}`}
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
                  <BowlingBallIcon size={18} aria-hidden="true" />
                </span>
              )}
            </span>
          ))}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-headline leading-snug text-ink">{t`Arsenal`}</span>
        <span className="block text-footnote leading-snug text-ink-secondary">{detail}</span>
      </span>
      <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
    </button>
  );
}

/** The latest session averages as a line, with the bowler's average dashed
 *  across it and the last session marked. Drawn to a 100 x 40 box and
 *  stretched, so it takes whatever width the card leaves it. */
function TrendLine({ trend, average }: { trend: number[]; average: number }) {
  const lo = Math.min(average, ...trend);
  const hi = Math.max(average, ...trend);
  const span = hi - lo || 1;
  const y = (v: number) => 36 - ((v - lo) / span) * 32;
  const x = (i: number) => (i / (trend.length - 1)) * 96 + 2;
  const d = trend.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const lastX = x(trend.length - 1);
  const lastY = y(trend[trend.length - 1]);
  return (
    <div className="relative h-14 w-full">
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <line x1="0" x2="100" y1={y(average)} y2={y(average)} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" className="stroke-ink-tertiary" strokeOpacity={0.5} />
      <path d={`${d} L${lastX} 40 L2 40 Z`} className="fill-accent" fillOpacity={0.12} />
      <path d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-accent" />
    </svg>
      {/* The last session as a dot, drawn over the stretched line so it stays
          round. */}
      <span
        aria-hidden="true"
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
        style={{ left: `${lastX}%`, top: `${(lastY / 40) * 100}%` }}
      />
    </div>
  );
}

/**
 * Home's hero: the bowler's average, the last session against it, the line of
 * the latest sessions between them, and Start session, the one thing Home is
 * most often opened to do (ADR-245). Kept short, so the bowler's own things
 * and the tools still show on the first screen.
 */
export function HomeHero({ summary, onStart, disabled }: { summary: HomeSummary; onStart: () => void; disabled?: boolean }) {
  const { average, last, trend } = summary;
  const start = (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent-fill px-4 py-2.5 text-callout font-semibold text-accent-on-fill active:bg-accent-fill-hover disabled:opacity-50"
    >
      <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
      {t`Start session`}
    </button>
  );
  if (average === null || last === null) return start;
  const diff = last.average - Math.round(average);
  const tone = diff > 0 ? "text-success-700" : diff < 0 ? "text-danger-700" : "text-ink";
  return (
    <section
      aria-label={t`Your average`}
      className="rounded-[26px] bg-[radial-gradient(130%_100%_at_100%_0%,rgb(var(--color-accent-soft)),rgb(var(--color-surface))_70%)] p-4"
    >
      <div className="flex items-end gap-4">
        <div className="shrink-0">
          <p className="text-caption font-semibold uppercase tracking-wide text-ink-secondary">{t`Your average`}</p>
          <p className="text-large-title font-extrabold leading-none tracking-tight tabular-nums text-ink">
            {formatNumber(Math.round(average))}
          </p>
          <p className="mt-1.5 text-footnote text-ink-secondary">
            {t({ message: "Last session", comment: "Label before the bowler's average in their latest session, e.g. Last session 214" })}{" "}
            <span className={`font-semibold tabular-nums ${tone}`}>{formatNumber(last.average)}</span>
          </p>
        </div>
        {trend.length > 1 && (
          <div className="relative min-w-0 flex-1 pb-1">
            <TrendLine trend={trend} average={average} />
          </div>
        )}
      </div>
      <div className="mt-3">{start}</div>
    </section>
  );
}

function Tile({
  art,
  label,
  detail,
  onClick
}: {
  art: ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // A picture card: the drawing fills the top of the tile edge to edge
      // and fades into it just above the name, so the tile reads as a place
      // rather than an icon with a caption, and the name still sits on the
      // plain card in either theme. Raised and pressable (`.card-button`),
      // with no chevron: the raise says it can be tapped.
      className="card-button flex min-w-0 flex-col overflow-hidden rounded-[22px] text-left"
    >
      <span
        aria-hidden="true"
        className="block h-[5.5rem] w-full [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
      >
        {art}
      </span>
      <span className="block w-full min-w-0 px-3 pb-3 pt-1">
        {/* One line at the standard size; at a large text size a name
            wider than its third of the row takes a second line rather than
            running into the next tile. Hyphenated and free to break, as the
            tool cards' names are. */}
        <span className="block hyphens-auto text-subhead font-semibold leading-tight tracking-tight text-ink [overflow-wrap:anywhere]">
          {label}
        </span>
        {/* Two lines, not one: an empty tile says what it is for, and that
            is a short sentence rather than a count. */}
        <span className="line-clamp-2 block text-xs text-ink-secondary">{detail ?? " "}</span>
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
  count: (n: number) => string,
  empty: string
): string | undefined {
  if (n == null) return undefined;
  return n === 0 ? empty : count(n);
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
        art={<SpareLinesArt />}
        label={t`Spare lines`}
        detail={counted(
          spareLines,
          (n) => plural(n, { one: "# leave", other: "# leaves" }),
          t`Where you shoot each spare`
        )}
        onClick={onOpenSpareLines}
      />
      <Tile
        art={<LaneNotesArt />}
        label={t`Lane notes`}
        detail={counted(
          laneNotes,
          (n) => plural(n, { one: "# note", other: "# notes" }),
          t`How each lane plays`
        )}
        onClick={onOpenLaneNotes}
      />
      <Tile
        art={<GamePlanArt />}
        label={t`Game plan`}
        detail={counted(
          alleys,
          (n) => plural(n, { one: "# alley", other: "# alleys" }),
          t`Your numbers at each alley`
        )}
        onClick={onOpenAlleyReport}
      />
    </div>
  );
}
