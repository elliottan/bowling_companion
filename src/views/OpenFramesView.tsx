import { useMemo, useState } from "react";
import { Target } from "lucide-react";
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
  const { filtered, activeLanes } = useSessionFilters();
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
        {report.games === 0 ? (
          <EmptyState
            icon={Target}
            title="Nothing open yet"
            description="Finish a game and the leaves you missed show up here, most often first."
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setNote((n) => !n)}
              className="flex w-full items-baseline gap-2 rounded-lg border border-edge bg-surface p-4 text-left shadow-sm"
            >
              <span className="text-4xl font-bold tabular-nums leading-none text-ink">
                {report.openFramesPerGame}
              </span>
              <span className="text-sm font-semibold text-ink-secondary">
                open frames a game
              </span>
              <span className="ml-auto text-xs tabular-nums text-ink-tertiary">
                {report.games} {report.games === 1 ? "game" : "games"}
              </span>
            </button>

            {note && (
              <button
                type="button"
                onClick={() => setNote(false)}
                className="mt-2 w-full rounded-lg border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
              >
                Makeable leaves only. A real split or a washout is a first ball you did not get,
                not a spare you missed. Tap to dismiss.
              </button>
            )}

            {report.trend.length > 1 && <OpenFrameTrend points={report.trend} />}

            <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Most often open</h2>
            <ul className="divide-y divide-edge rounded-lg border border-edge bg-surface shadow-sm">
              {report.leaves.slice(0, 12).map((leave) => (
                <li key={leave.pins.join("-")} className="flex items-center gap-3 px-3 py-2.5">
                  <MiniPins standing={leave.pins} size="sm" />
                  <span className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-ink">
                    {leave.conversions} of {leave.chances} made
                  </span>
                  <span className="w-14 shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-ink">
                      {leave.misses}
                    </span>
                    <span className="block text-[10px] text-ink-tertiary">open</span>
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
