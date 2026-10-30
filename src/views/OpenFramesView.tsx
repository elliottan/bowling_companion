import { plural, t } from "@lingui/core/macro";
import { formatNumber, formatPercent } from "../lib/format";
import { useMemo, useState } from "react";
import { RackIcon } from "../components/icons";
import { LoadingCard } from "../components/ui/LoadingCard";
import { PushScreen } from "../components/PushScreen";
import { MiniPins } from "../components/MiniPins";
import { EmptyState } from "../components/ui/EmptyState";
import { GROUP_HEADING } from "../components/ui/typography";
import { calculateOpenFrames, type OpenFrameTrendPoint } from "../lib/stats";
import { useSessionFilters } from "./useSessionFilters";
import { ErrorBanner } from "../components/ErrorBanner";

/** A per-game rate to one decimal, or a dash where there is none. */
function oneDecimal(value: number | null): string {
  return value === null ? "-" : formatNumber(value, 1);
}

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
  const { filtered, activeLanes, isLoading, error } = useSessionFilters();
  const report = useMemo(
    () => calculateOpenFrames(filtered, activeLanes),
    [filtered, activeLanes]
  );
  // The definition lives behind the number it defines, the way the stat tiles
  // do it (ADR-040): cheaper than a paragraph nobody reads twice.
  const [note, setNote] = useState(false);

  return (
    <PushScreen title={t({ message: "Open frames", comment: "Bowling term: a frame that ended with pins still standing, neither a strike nor a spare" })} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {error ? (
          <ErrorBanner>{t`Your sessions could not be read. Reload the app, then try again.`}</ErrorBanner>
        ) : isLoading ? (
          <LoadingCard />
        ) : report.games === 0 ? (
          <EmptyState
            icon={RackIcon}
            title={t`Nothing open yet`}
            description={t({ message: "The leaves you keep missing rank here, most often first. Finish a game to start the count.", comment: "A leave is the set of pins left standing after the first ball (bowling term)" })}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setNote((n) => !n)}
              className="w-full rounded-xl border border-edge bg-surface p-4 text-left shadow-sm"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums leading-none text-ink">
                  {oneDecimal(report.openFramesPerGame)}
                </span>
                <span className="text-sm font-semibold text-ink-secondary">
                  {t({ message: "open frames a game", comment: "Bowling term: an open frame is one with pins left standing after both balls. Lowercase label next to a number." })}
                </span>
                <span className="ml-auto text-xs tabular-nums text-ink-tertiary">
                  {plural(report.games, { one: "# game", other: "# games" })}
                </span>
              </span>
              <span className="mt-1 block text-sm font-semibold text-danger-600">
                {t`about ${{ pins: oneDecimal(report.pinsLostPerGame) }} pins a game`}
              </span>
              {/* The three kinds under the number they add up to, rather than
                  filtered out of it: a night of splits is a first-ball night,
                  and hiding them would just shrink the headline. */}
              <span className="mt-3 grid grid-cols-3 gap-1.5">
                <Kind label={t({ message: "Makeable", comment: "Bowling term: a leave that can be converted into a spare" })} value={report.makeable.perGame} strong />
                <Kind label={t({ message: "Washouts", comment: "Bowling term: a leave with the head pin gone and pins scattered on both sides" })} value={report.washout.perGame} />
                <Kind label={t({ message: "Splits", comment: "Bowling term: a leave with a gap between the standing pins" })} value={report.split.perGame} />
              </span>
            </button>

            {note && (
              <button
                type="button"
                onClick={() => setNote(false)}
                className="mt-2 w-full rounded-xl border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
              >
                {t({ message: "An open frame gives up about 11 pins on average.", comment: "An open frame is a bowling term: a frame with pins left standing after both balls" })}
              </button>
            )}

            {report.trend.length > 1 && <OpenFrameTrend points={report.trend} />}

            <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>{t({ message: "Most opens (makeables)", comment: "Bowling terms: opens are open frames; makeables are leaves that can be converted to a spare" })}</h2>
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface shadow-sm">
              {report.leaves.slice(0, 12).map((leave) => (
                <li key={leave.pins.join("-")} className="flex items-center gap-3 px-3 py-2.5">
                  <MiniPins standing={leave.pins} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tabular-nums text-ink">
                      {t`${{ conversions: formatNumber(leave.conversions) }} of ${{ chances: formatNumber(leave.chances) }} made`}
                    </span>
                    <span className="block text-xs tabular-nums text-ink-secondary">
                      {leave.conversionPct !== null ? formatPercent(leave.conversionPct) : "-"}
                    </span>
                  </span>
                  {/* Per game, not a raw count: right-handers leave more 10
                      pins than anything else, so the total says as much about
                      the first ball as about the spare. */}
                  <span className="w-16 shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-ink">
                      {oneDecimal(leave.perGame)}
                    </span>
                    <span className="block text-caption-2 leading-tight text-ink-tertiary">{t({ message: "open frames", comment: "Bowling term: frames left open. Two-line label, followed by a line reading a game" })}<br />{t`a game`}</span>
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
      <span className="block text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">
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
    <div className="mt-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t`Open frames a game by session, oldest first. ${{ points: shown.map((p) => `${p.date}: ${formatNumber(p.perGame, 1)}`).join(", ") }}.`}
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
        <text x={INSET_X} y={H - 4} className="fill-ink-tertiary" fontSize="11">
          {shortDate(shown[0].date)}
        </text>
        <text
          x={W - INSET_X}
          y={H - 4}
          textAnchor="end"
          className="fill-ink-tertiary"
          fontSize="11"
        >
          {shortDate(shown[shown.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}
