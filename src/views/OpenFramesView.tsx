import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { LoadingCard } from "../components/ui/LoadingCard";
import { PushScreen } from "../components/PushScreen";
import { MiniPins } from "../components/MiniPins";
import { EmptyState } from "../components/ui/EmptyState";
import { GROUP_HEADING } from "../components/ui/typography";
import { calculateOpenFrames, type OpenFrameTrendPoint } from "../lib/stats";
import { useSessionFilters } from "./useSessionFilters";

/**
 * How often frames go open, and on what, for whatever the Stats tab is
 * filtered to.
 *
 * It reads the shared filter itself rather than taking it as a prop: the
 * filter already outlives both tabs (`useSessionFilters`), so an overlay
 * pushed over either of them picks up the same sessions with no threading
 * through `App`.
 */
export function OpenFramesView({ onBack }: { onBack: () => void }) {
  const { filtered, activeLanes, isLoading } = useSessionFilters();
  const report = useMemo(
    () => calculateOpenFrames(filtered, activeLanes),
    [filtered, activeLanes]
  );
  // The definition lives behind the number it defines, the way the stat tiles
  // do it (ADR-040): cheaper than a paragraph nobody reads twice.
  const [note, setNote] = useState(false);

  return (
    <PushScreen title="Open frames" onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {isLoading ? (
          <LoadingCard />
        ) : report.games === 0 ? (
          <EmptyState
            icon={Target}
            title="Nothing open yet"
            description="The leaves you keep missing rank here, most often first. Finish a game to start the count."
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setNote((n) => !n)}
              className="w-full rounded-lg border border-edge bg-surface p-4 text-left shadow-sm"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums leading-none text-ink">
                  {report.openFramesPerGame}
                </span>
                <span className="text-sm font-semibold text-ink-secondary">
                  open frames a game
                </span>
                <span className="ml-auto text-xs tabular-nums text-ink-tertiary">
                  {report.games} {report.games === 1 ? "game" : "games"}
                </span>
              </span>
              <span className="mt-1 block text-sm font-semibold text-danger-600">
                about {report.pinsLostPerGame} pins a game
              </span>
              {/* The three kinds under the number they add up to, rather than
                  filtered out of it: a night of splits is a first-ball night,
                  and hiding them would just shrink the headline. */}
              <span className="mt-3 grid grid-cols-3 gap-1.5">
                <Kind label="Makeable" value={report.makeable.perGame} strong />
                <Kind label="Washouts" value={report.washout.perGame} />
                <Kind label="Splits" value={report.split.perGame} />
              </span>
            </button>

            {note && (
              <button
                type="button"
                onClick={() => setNote(false)}
                className="mt-2 w-full rounded-lg border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
              >
                An open frame gives up about 11 pins on average.
              </button>
            )}

            {report.trend.length > 1 && <OpenFrameTrend points={report.trend} />}

            <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Most opens (makeables)</h2>
            <ul className="divide-y divide-edge rounded-lg border border-edge bg-surface shadow-sm">
              {report.leaves.slice(0, 12).map((leave) => (
                <li key={leave.pins.join("-")} className="flex items-center gap-3 px-3 py-2.5">
                  <MiniPins standing={leave.pins} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tabular-nums text-ink">
                      {leave.conversions} of {leave.chances} made
                    </span>
                    <span className="block text-xs tabular-nums text-ink-secondary">
                      {leave.conversionPct}%
                    </span>
                  </span>
                  {/* Per game, not a raw count: right-handers leave more 10
                      pins than anything else, so the total says as much about
                      the first ball as about the spare. */}
                  <span className="w-16 shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-ink">
                      {leave.perGame}
                    </span>
                    <span className="block text-[10px] text-ink-tertiary">open/gm</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PushScreen>
  );
}

/** One of the three kinds of open, under the headline they add up to. */
function Kind({
  label,
  value,
  strong = false
}: {
  label: string;
  value: number | null;
  strong?: boolean;
}) {
  return (
    <span className="block rounded-lg bg-surface-muted px-1 py-1.5 text-center">
      <span
        className={`block text-sm font-bold tabular-nums ${strong ? "text-ink" : "text-ink-secondary"}`}
      >
        {value ?? "-"}
      </span>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
        {label}
      </span>
    </span>
  );
}

const W = 320;
const H = 96;
const INSET_X = 12;
const INSET_TOP = 12;
const INSET_BOTTOM = 18;
/** Sessions shown, newest kept. Beyond this the points merge into a smear. */
const MAX_POINTS = 20;
/** Smallest top of the scale, so two tidy nights do not draw as a cliff. */
const MIN_TOP = 2;

const shortDate = (iso: string) => iso.slice(5).replace("-", "/");

/** Open frames a game, by night, oldest on the left. Down is better here, so
 *  it is drawn as bars rather than a line: a falling line reads as a loss. */
function OpenFrameTrend({ points }: { points: OpenFrameTrendPoint[] }) {
  const shown = points.slice(-MAX_POINTS);
  const top = Math.max(MIN_TOP, ...shown.map((p) => p.perGame));
  const plotH = H - INSET_TOP - INSET_BOTTOM;
  const slot = (W - INSET_X * 2) / shown.length;
  const barW = Math.min(22, slot * 0.7);

  return (
    <div className="mt-3 rounded-lg border border-edge bg-surface p-3 shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Open frames a game by session, oldest first. ${shown
          .map((p) => `${p.date}: ${p.perGame}`)
          .join(", ")}.`}
      >
        {shown.map((p, i) => {
          const x = INSET_X + slot * i + (slot - barW) / 2;
          const h = Math.max(2, (p.perGame / top) * plotH);
          return (
            <rect
              key={`${p.sessionId ?? ""}:${p.date}`}
              x={x}
              y={INSET_TOP + plotH - h}
              width={barW}
              height={h}
              rx={2}
              className="fill-accent-fill"
            />
          );
        })}
        <line
          x1={INSET_X}
          y1={INSET_TOP + plotH}
          x2={W - INSET_X}
          y2={INSET_TOP + plotH}
          className="stroke-edge"
          strokeWidth={1}
        />
        <text x={INSET_X} y={H - 4} className="fill-ink-tertiary" fontSize="9">
          {shortDate(shown[0].date)}
        </text>
        <text
          x={W - INSET_X}
          y={H - 4}
          textAnchor="end"
          className="fill-ink-tertiary"
          fontSize="9"
        >
          {shortDate(shown[shown.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}
