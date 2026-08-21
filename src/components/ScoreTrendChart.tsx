import type { Game } from "../types/bowling";

interface ScoreTrendChartProps {
  games: Array<Pick<Game, "game_number" | "final_score">>;
}

/** Half a band of headroom around the scores, so a point never sits on the edge. */
const PAD = 15;
/** Smallest y range the chart will draw. Without a floor the axis re-fits every
 *  session, so a 12-pin wobble and a 90-pin collapse look identical. */
const MIN_HALF_RANGE = 40;

const W = 320;
const H = 120;
const INSET_X = 14;
const INSET_TOP = 18;
const INSET_BOTTOM = 16;

/**
 * Score by game for one session: a line through the scored games, the session
 * average as a dotted rule, and the high and low games marked.
 *
 * Unscored games are dropped and the line does NOT bridge the gap. Drawing
 * straight through a game that was never scored invents a trend that was not
 * bowled.
 */
export function ScoreTrendChart({ games }: ScoreTrendChartProps) {
  const scored = games
    .filter((g): g is { game_number: number; final_score: number } =>
      typeof g.final_score === "number"
    )
    .sort((a, b) => a.game_number - b.game_number);

  if (scored.length === 0) return null;

  const scores = scored.map((g) => g.final_score);
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  const top = Math.max(high + PAD, avg + MIN_HALF_RANGE);
  const bottom = Math.min(low - PAD, avg - MIN_HALF_RANGE);
  const span = top - bottom;

  const lastGame = scored[scored.length - 1].game_number;
  const firstGame = scored[0].game_number;
  const gameSpan = Math.max(1, lastGame - firstGame);

  const x = (gameNumber: number) =>
    INSET_X + ((gameNumber - firstGame) / gameSpan) * (W - INSET_X * 2);
  const y = (score: number) =>
    INSET_TOP + ((top - score) / span) * (H - INSET_TOP - INSET_BOTTOM);

  // One segment per adjacent pair of *consecutive* games. A skipped game
  // number means an unscored game sat between them, so the line breaks.
  const segments = scored.slice(1).reduce<string[]>((acc, g, i) => {
    const prev = scored[i];
    if (g.game_number - prev.game_number === 1) {
      acc.push(
        `M ${x(prev.game_number)} ${y(prev.final_score)} L ${x(g.game_number)} ${y(g.final_score)}`
      );
    }
    return acc;
  }, []);

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Score by game. ${scored
          .map((g) => `Game ${g.game_number}: ${g.final_score}`)
          .join(", ")}. Average ${Math.round(avg)}.`}
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

        {segments.map((d) => (
          <path key={d} d={d} fill="none" strokeWidth={2} className="stroke-accent" />
        ))}

        {scored.map((g) => {
          const isHigh = g.final_score === high;
          const isLow = g.final_score === low && low !== high;
          return (
            <g key={g.game_number}>
              <circle
                cx={x(g.game_number)}
                cy={y(g.final_score)}
                r={isHigh || isLow ? 4 : 3}
                className={
                  isHigh
                    ? "fill-success-700"
                    : isLow
                      ? "fill-danger-600"
                      : "fill-accent"
                }
              />
              <text
                x={x(g.game_number)}
                y={y(g.final_score) - 8}
                textAnchor="middle"
                className="fill-ink text-[10px] font-semibold tabular-nums"
              >
                {g.final_score}
              </text>
              <text
                x={x(g.game_number)}
                y={H - 3}
                textAnchor="middle"
                className="fill-ink-tertiary text-[9px] tabular-nums"
              >
                {g.game_number}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
