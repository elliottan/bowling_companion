import { useState, type ReactNode } from "react";
import type { SessionTrendPoint } from "../lib/stats";

interface SessionTrendChartProps {
  sessions: SessionTrendPoint[];
  /** Rendered inside the card, above the plot: the metric's name and its note.
   *  Passed in rather than built here so this chart and `MetricTrendChart`
   *  wear the same header while the tiles switch between them. */
  header?: ReactNode;
  /** Open the session a selected point belongs to. */
  onOpenSession?: (sessionId: number) => void;
}

/** Half a band of headroom around the scores, so a point never sits on the edge. */
const PAD = 15;
/** Smallest half-range the chart will draw, so a 12-pin wobble and a 90-pin
 *  collapse do not look the same. Matches the per-session chart. */
const MIN_HALF_RANGE = 40;
/** Sessions shown, newest kept. Beyond this the dots merge into a smear. */
const MAX_POINTS = 20;

const W = 320;
const H = 140;
const INSET_X = 14;
const INSET_TOP = 18;
const INSET_BOTTOM = 16;

const shortDate = (iso: string) => iso.slice(5).replace("-", "/");

/**
 * Form across sessions: a line through each session's average, with a faint dot
 * for every game behind it, oldest on the left.
 *
 * The per-session chart deliberately does not bridge an unscored game, and the
 * same reasoning applies here at a different scale: each point is one night, so
 * the line says "the next time out", not "the next game". The game dots keep
 * the spread visible, which an average alone hides: a 170/240 night and two
 * 205s average the same.
 */
export function SessionTrendChart({ sessions, header, onOpenSession }: SessionTrendChartProps) {
  // Which point the reader is asking about. A chart of averages answers "how
  // am I going"; the follow-up is always "which night was that", so a tap
  // names it and a tap on the answer goes there.
  //
  // Held as the night's own key rather than its position: the filters above
  // this chart rewrite the list under it, and an index kept pointing at
  // whatever moved into that slot (or past the end of a shorter list).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const points = sessions.filter((s) => s.scores.length > 0).slice(-MAX_POINTS);
  if (points.length === 0) return null;

  const averages = points.map((p) => p.average);
  const everyScore = points.flatMap((p) => p.scores);
  const high = Math.max(...averages);
  const low = Math.min(...averages);
  const avg = averages.reduce((a, b) => a + b, 0) / averages.length;
  const top = Math.max(Math.max(...everyScore) + PAD, avg + MIN_HALF_RANGE);
  const bottom = Math.min(Math.min(...everyScore) - PAD, avg - MIN_HALF_RANGE);
  const span = top - bottom;

  const lastIndex = Math.max(1, points.length - 1);
  const x = (i: number) =>
    points.length === 1 ? W / 2 : INSET_X + (i / lastIndex) * (W - INSET_X * 2);
  const y = (score: number) =>
    INSET_TOP + ((top - score) / span) * (H - INSET_TOP - INSET_BOTTOM);

  // Wide enough to hit, never wider than the gap to the next point.
  const columnWidth =
    points.length === 1 ? W : Math.max(18, (W - INSET_X * 2) / Math.max(1, points.length - 1));

  const keyOf = (p: SessionTrendPoint) => `${p.sessionId ?? ""}:${p.date}`;
  const selectedIndex = points.findIndex((p) => keyOf(p) === selectedKey);
  const selected = selectedIndex === -1 ? null : selectedIndex;
  const toggle = (p: SessionTrendPoint) =>
    setSelectedKey((curr) => (curr === keyOf(p) ? null : keyOf(p)));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.average)}`)
    .join(" ");

  // Only the ends and the extremes are labelled. One date under every point is
  // unreadable at twenty of them, and the shape is what this chart is for.
  const labelled = new Set([0, points.length - 1]);

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      {header}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Average by session, oldest first. ${points
          .map((p) => `${p.date}: ${p.average}`)
          .join(", ")}. Overall average ${Math.round(avg)}.`}
      >
        <line
          x1={0}
          x2={W}
          y1={y(avg)}
          y2={y(avg)}
          strokeDasharray="4 4"
          className="stroke-edge-strong"
          strokeWidth={1}
        />
        <text
          x={W}
          y={y(avg) - 4}
          textAnchor="end"
          className="fill-ink-tertiary text-[9px] tabular-nums"
        >
          avg {Math.round(avg)}
        </text>

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

        {/* The games behind each average, drawn under the line. */}
        {points.map((p, i) =>
          p.scores.map((score, j) => (
            <circle
              key={`${p.date}-${i}-${j}`}
              cx={x(i)}
              cy={y(score)}
              r={1.6}
              className="fill-ink-tertiary opacity-60"
            />
          ))
        )}

        {points.length > 1 && (
          <path d={line} fill="none" strokeWidth={2} className="stroke-accent" />
        )}

        {points.map((p, i) => {
          const isHigh = p.average === high && high !== low;
          const isLow = p.average === low && high !== low;
          return (
            <g key={`${p.date}-${i}`}>
              {selected === i && (
                <circle
                  cx={x(i)}
                  cy={y(p.average)}
                  r={6}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-accent"
                />
              )}
              <circle
                cx={x(i)}
                cy={y(p.average)}
                r={isHigh || isLow ? 4 : 3}
                className={isHigh ? "fill-success-700" : isLow ? "fill-danger-600" : "fill-accent"}
              />
              {(isHigh || isLow) && (
                <text
                  x={x(i)}
                  y={y(p.average) - 8}
                  textAnchor="middle"
                  className="fill-ink text-[10px] font-semibold tabular-nums"
                >
                  {p.average}
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
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}-${i}`}
            x={x(i) - columnWidth / 2}
            y={0}
            width={columnWidth}
            height={H}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${p.date}, ${p.alley}, average ${p.average}`}
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
        <SelectedSession
          point={points[selected]}
          onOpen={onOpenSession}
          onDismiss={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}

/** The night behind the selected point, and the way into it. */
function SelectedSession({
  point,
  onOpen,
  onDismiss
}: {
  point: SessionTrendPoint;
  onOpen?: (sessionId: number) => void;
  onDismiss: () => void;
}) {
  const detail = [point.event, `${point.scores.length} ${point.scores.length === 1 ? "game" : "games"}`]
    .filter(Boolean)
    .join(" · ");
  const canOpen = onOpen && point.sessionId != null;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-ink-strong">{point.alley}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-secondary">{point.date}</span>
      </span>
      {detail && <span className="truncate text-xs text-ink-secondary">{detail}</span>}
      {/* Every game of the night, in the order they were bowled. High and low
          alone hid the shape: 150/240 and 195/195 both read as one number. */}
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs tabular-nums text-ink-secondary">
        <span>
          <span className="font-bold text-accent">{point.average}</span> avg
        </span>
        {point.scores.map((score, i) => (
          <span key={i}>
            <span className="text-ink-tertiary">G{i + 1}</span>{" "}
            <span className="font-semibold text-ink">{score}</span>
          </span>
        ))}
      </span>
    </>
  );

  return canOpen ? (
    <button
      type="button"
      onClick={() => onOpen(point.sessionId as number)}
      className="mt-2 flex w-full flex-col gap-0.5 rounded-lg border border-edge bg-surface-muted p-2.5 text-left active:bg-surface"
    >
      {body}
    </button>
  ) : (
    <div
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onKeyDown={(e) => e.key === "Enter" && onDismiss()}
      className="mt-2 flex w-full flex-col gap-0.5 rounded-lg border border-edge bg-surface-muted p-2.5 text-left"
    >
      {body}
    </div>
  );
}
