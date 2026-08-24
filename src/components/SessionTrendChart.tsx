export interface SessionPoint {
  /** Session date, `YYYY-MM-DD`, used for the axis label. */
  date: string;
  /** Average of the session's completed games. */
  average: number;
  /** Every completed game of that session, for the dots behind the line. */
  scores: number[];
}

interface SessionTrendChartProps {
  sessions: SessionPoint[];
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
export function SessionTrendChart({ sessions }: SessionTrendChartProps) {
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

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.average)}`)
    .join(" ");

  // Only the ends and the extremes are labelled. One date under every point is
  // unreadable at twenty of them, and the shape is what this chart is for.
  const labelled = new Set([0, points.length - 1]);

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
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
      </svg>
    </div>
  );
}
