import { useState, type ReactNode } from "react";

/** One night's value of whichever metric is selected. */
export interface MetricPoint {
  sessionId?: number;
  date: string;
  alley: string;
  event?: string;
  games: number;
  /** `null` when the night had no opportunity to produce one, so it is a gap
   *  in the line rather than a zero. */
  value: number | null;
}

interface MetricTrendChartProps {
  points: MetricPoint[];
  /** Rendered inside the card, above the plot: the metric's name and its note. */
  header?: ReactNode;
  /** The same metric across everything in view, drawn as the baseline. */
  overall: number | null;
  format: (value: number) => string;
  /** Floor and ceiling the metric cannot leave (0 to 100 for a rate). */
  min: number;
  max: number;
  /** Smallest span the chart will draw, so a two-point wobble does not fill
   *  the card and read as a collapse. */
  minSpan: number;
  onOpenSession?: (sessionId: number) => void;
}

const W = 320;
const H = 140;
const INSET_X = 14;
const INSET_TOP = 18;
const INSET_BOTTOM = 16;
/** Sessions shown, newest kept. Beyond this the dots merge into a smear. */
const MAX_POINTS = 20;

const shortDate = (iso: string) => iso.slice(5).replace("-", "/");

/**
 * Any one stat, by night, oldest on the left.
 *
 * The average keeps its own chart (`SessionTrendChart`), which draws a dot per
 * game behind each point. That spread is meaningful for a score and meaningless
 * for a rate: there is no such thing as one game's carry sitting behind the
 * night's carry, because a rate over two games is not the mean of two rates.
 * So this chart plots the value and nothing else.
 */
export function MetricTrendChart({
  points,
  header,
  overall,
  format,
  min,
  max,
  minSpan,
  onOpenSession
}: MetricTrendChartProps) {
  // Held as the night's own key rather than its position: the filters above
  // rewrite the list under this chart, and an index kept pointing at whatever
  // moved into that slot.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const shown = points.slice(-MAX_POINTS);
  const withValue = shown.filter((p) => p.value !== null);
  if (withValue.length === 0) return null;

  const values = withValue.map((p) => p.value as number);
  const top = Math.min(max, Math.max(...values) + minSpan / 4);
  const bottom = Math.max(min, Math.min(...values) - minSpan / 4);
  // Grow a flat run out to the minimum span rather than magnifying noise.
  const mid = (top + bottom) / 2;
  const half = Math.max(minSpan / 2, (top - bottom) / 2);
  const hi = Math.min(max, mid + half);
  const lo = Math.max(min, mid - half);
  const span = hi - lo || 1;

  const lastIndex = Math.max(1, shown.length - 1);
  const x = (i: number) =>
    shown.length === 1 ? W / 2 : INSET_X + (i / lastIndex) * (W - INSET_X * 2);
  const y = (value: number) =>
    INSET_TOP + ((hi - value) / span) * (H - INSET_TOP - INSET_BOTTOM);

  // Wide enough to hit, never wider than the gap to the next point.
  const columnWidth =
    shown.length === 1 ? W : Math.max(18, (W - INSET_X * 2) / Math.max(1, shown.length - 1));

  const keyOf = (p: MetricPoint) => `${p.sessionId ?? ""}:${p.date}`;
  const selectedIndex = shown.findIndex((p) => keyOf(p) === selectedKey);
  const selected = selectedIndex === -1 ? null : selectedIndex;
  const toggle = (p: MetricPoint) =>
    setSelectedKey((curr) => (curr === keyOf(p) ? null : keyOf(p)));

  // A night with no value breaks the line rather than bridging it, the same
  // way the score chart refuses to bridge an unscored game.
  const segments: string[] = [];
  let current: string[] = [];
  shown.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  // Only the ends are labelled. One date under every point is unreadable at
  // twenty of them, and the shape is what this chart is for.
  const labelled = new Set([0, shown.length - 1]);

  // The best and worst night get their value printed. Only the FIRST of each,
  // because a rate ties far more often than a score does: two 100% nights both
  // printing put one label on top of the other.
  const highValue = Math.max(...values);
  const lowValue = Math.min(...values);
  const highIndex = shown.findIndex((p) => p.value === highValue);
  const lowIndex = shown.findIndex((p) => p.value === lowValue);
  const showExtremes = highValue !== lowValue;

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
      {header}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`By session, oldest first. ${shown
          .map((p) => `${p.date}: ${p.value === null ? "none" : format(p.value)}`)
          .join(", ")}.`}
      >
        {overall !== null && overall <= hi && overall >= lo && (
          <>
            <line
              x1={0}
              x2={W}
              y1={y(overall)}
              y2={y(overall)}
              strokeDasharray="4 4"
              className="stroke-edge-strong"
              strokeWidth={1}
            />
            <text
              x={W}
              y={y(overall) - 4}
              textAnchor="end"
              className="fill-ink-tertiary text-[9px] tabular-nums"
            >
              {format(overall)}
            </text>
          </>
        )}

        {selected !== null && (
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={INSET_TOP - 12}
            y2={H - INSET_BOTTOM + 4}
            className="stroke-edge-strong"
            strokeWidth={1}
          />
        )}

        {segments.map((d) => (
          <path key={d} d={d} fill="none" strokeWidth={2} className="stroke-accent" />
        ))}

        {shown.map((p, i) => {
          if (p.value === null) return null;
          const isHigh = showExtremes && p.value === highValue;
          const isLow = showExtremes && p.value === lowValue;
          const labelThis = showExtremes && (i === highIndex || i === lowIndex);
          return (
            <g key={`${p.date}-${i}`}>
              {selected === i && (
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r={6}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-accent"
                />
              )}
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={isHigh || isLow ? 4 : 3}
                className={
                  isHigh && !isLow
                    ? "fill-success-700"
                    : isLow && !isHigh
                      ? "fill-danger-600"
                      : "fill-accent"
                }
              />
              {labelThis && (
                // Pinned inside the box: a value printed over the last point
                // would otherwise hang off the right edge.
                <text
                  x={Math.min(W - 4, Math.max(4, x(i)))}
                  y={y(p.value) - 8}
                  textAnchor={i === 0 ? "start" : i === shown.length - 1 ? "end" : "middle"}
                  className="fill-ink text-[10px] font-semibold tabular-nums"
                >
                  {format(p.value)}
                </text>
              )}
              {labelled.has(i) && (
                <text
                  x={x(i)}
                  y={H - 3}
                  textAnchor={i === 0 ? "start" : "end"}
                  className="fill-ink-tertiary text-[9px] tabular-nums"
                >
                  {shortDate(p.date)}
                </text>
              )}
            </g>
          );
        })}

        {/* Full-height columns, so the tap lands on the night rather than on a
            3px dot. Drawn last so they sit above everything they select. */}
        {shown.map((p, i) => (
          <rect
            key={`hit-${p.date}-${i}`}
            x={x(i) - columnWidth / 2}
            y={0}
            width={columnWidth}
            height={H}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${p.date}, ${p.alley}, ${p.value === null ? "no value" : format(p.value)}`}
            onClick={() => toggle(p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(p);
              }
            }}
            className="cursor-pointer outline-none"
          />
        ))}
      </svg>

      {selected !== null && (
        <SelectedNight
          point={shown[selected]}
          format={format}
          onOpen={onOpenSession}
          onDismiss={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}

/** The night behind the selected point, and the way into it. */
function SelectedNight({
  point,
  format,
  onOpen,
  onDismiss
}: {
  point: MetricPoint;
  format: (value: number) => string;
  onOpen?: (sessionId: number) => void;
  onDismiss: () => void;
}) {
  const detail = [point.event, `${point.games} ${point.games === 1 ? "game" : "games"}`]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-ink">{point.alley}</span>
        <span className="ml-1.5 text-ink-secondary">{detail}</span>
      </span>
      <span className="shrink-0 font-bold tabular-nums text-ink">
        {point.value === null ? "-" : format(point.value)}
      </span>
    </>
  );

  if (point.sessionId == null || !onOpen) {
    return (
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 flex w-full items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-left text-xs"
      >
        {body}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(point.sessionId as number)}
      className="mt-2 flex w-full items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-left text-xs hover:bg-edge"
    >
      {body}
    </button>
  );
}
