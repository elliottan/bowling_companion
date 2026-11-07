import { t } from "@lingui/core/macro";
import { useId } from "react";
import type { LanePart, TermFigure as Figure } from "../lib/guides";

/**
 * The small picture beside a term on the Bowling terms page (ADR-249).
 *
 * Drawn, on the theme tokens, like the layout guides' figures (`GuideFigure`):
 * offline at the alley, dark mode included, and nothing that is anyone else's
 * to ship. Three kinds of picture cover every term that has one: a pin deck
 * seen from the approach, frames as a scoresheet writes them, and the lane
 * from above.
 *
 * Decorative beside the words, which already say it all, so each one is
 * hidden from a screen reader except for its short label.
 */
export function TermFigure({ figure, term }: { figure: Figure; term: string }) {
  switch (figure.kind) {
    case "leave":
      return (
        <Deck label={term} standing={figure.standing} mark={figure.mark} />
      );
    case "pin-move":
      return figure.motion === "messenger" ? (
        <Deck label={term} standing={[10]} mark={[1]} faint path={MOVES.messenger} />
      ) : (
        <BothHands
          right={<Deck label={term} standing={[10]} mark={[6]} faint path={MOVES[figure.motion]} />}
          left={<Deck label={term} standing={[7]} mark={[4]} faint path={MOVES[figure.motion]} mirror />}
        />
      );
    case "ball":
      return figure.hit === "pocket" || figure.hit === "brooklyn" ? (
        <BothHands
          right={<Deck label={term} standing={ALL} ball={BALLS[figure.hit]} />}
          left={<Deck label={term} standing={ALL} ball={BALLS[figure.hit]} mirror />}
        />
      ) : (
        <Deck label={term} standing={ALL} ball={BALLS[figure.hit]} />
      );
    case "frames":
      return <Frames frames={figure.frames} />;
    case "lane":
      return <Lane part={figure.part} label={term} />;
  }
}

// --- The deck --------------------------------------------------------------

/** Pin centres in inches, seen from the approach: the headpin nearest, the
 *  back row (7 to 10) furthest, 12 inches apart. */
const PINS: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-6, -10.39],
  3: [6, -10.39],
  4: [-12, -20.78],
  5: [0, -20.78],
  6: [12, -20.78],
  7: [-18, -31.18],
  8: [-6, -31.18],
  9: [6, -31.18],
  10: [18, -31.18]
};
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Half of a 41.5 inch lane. */
const EDGE = 20.75;

/** A pin's flight, for a right-hander; a left-hander's is the mirror. */
const MOVES = {
  // The 6 flies around the outside of the 10 and away behind it.
  ring: "M 12 -20.78 C 21 -21 25.5 -28 23.6 -35.4 S 18 -40.5 14.5 -40",
  // The 6 lies down in the gutter, short of the 10.
  flat: "M 12 -20.78 Q 19 -21 23.6 -25.4",
  // The headpin skids across the deck to take out the 10.
  messenger: "M 0 0 Q 15 -4 16.2 -27.2"
} as const;

/** Where the ball meets the rack, and the line it came in on, for a
 *  right-hander. */
const BALLS = {
  pocket: { at: [5.8, 2.6], from: "M 15.5 12 Q 14.5 6.2 10.2 4.4" },
  brooklyn: { at: [-5.8, 2.6], from: "M 15.5 12 Q 6 9.5 -1.4 4.6" },
  high: { at: [2.8, 4.4], from: "M 13 13 Q 11.5 7.5 7.1 5.8" },
  light: { at: [8.8, 1.4], from: "M 17 11 Q 16.5 5.5 13.1 2.6" }
} as const;

function Deck({
  label,
  standing,
  mark = [],
  faint = false,
  path,
  ball,
  mirror = false
}: {
  label: string;
  standing: number[];
  mark?: number[];
  /** Draw the pins that are down as dots, for a picture about one pin. */
  faint?: boolean;
  path?: string;
  ball?: { at: readonly number[]; from: string };
  /** A left-hander's: the paths and the ball flip, the pins stay where they are. */
  mirror?: boolean;
}) {
  const arrow = useId();
  const flip = mirror ? "scale(-1 1)" : undefined;
  return (
    <svg
      viewBox="-27 -43 54 59"
      role="img"
      aria-label={label}
      className="h-28 w-auto max-w-full"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 6 6" refX="4" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" className="fill-accent" />
        </marker>
      </defs>
      {/* The deck and its gutters. */}
      <rect x={-EDGE} y={-41} width={EDGE * 2} height={56} className="fill-surface-muted" />
      <rect x={-EDGE - 4.5} y={-41} width={4.5} height={56} className="fill-edge" opacity={0.5} />
      <rect x={EDGE} y={-41} width={4.5} height={56} className="fill-edge" opacity={0.5} />
      {/* Under the pins, so the moving pin's number stays readable. */}
      {path && (
        <path
          d={path}
          transform={flip}
          fill="none"
          className="stroke-accent"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeDasharray="2 1.4"
          markerEnd={`url(#${arrow})`}
        />
      )}
      {ALL.map((n) => {
        const [x, y] = PINS[n];
        const up = standing.includes(n) || mark.includes(n);
        if (!up) {
          return faint || standing.length < 10 ? (
            <circle key={n} cx={x} cy={y} r={1.1} className="fill-ink-tertiary" opacity={0.45} />
          ) : null;
        }
        const lit = mark.includes(n);
        return (
          <g key={n}>
            <circle cx={x} cy={y} r={2.9} className={lit ? "fill-accent" : "fill-ink"} />
            <text
              x={x}
              y={y + 1.15}
              textAnchor="middle"
              className={lit ? "fill-accent-on-fill" : "fill-surface"}
              style={{ fontSize: 3.2, fontWeight: 700 }}
            >
              {n}
            </text>
          </g>
        );
      })}
      {ball && (
        <g transform={flip}>
          <path d={ball.from} fill="none" className="stroke-accent" strokeWidth={1.1} strokeLinecap="round" strokeDasharray="2 1.4" />
          <circle cx={ball.at[0]} cy={ball.at[1]} r={4.25} className="fill-accent" opacity={0.9} />
        </g>
      )}
    </svg>
  );
}

function BothHands({ right, left }: { right: React.ReactNode; left: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <figure className="flex flex-col items-center">
        {right}
        <figcaption className="mt-1 text-caption text-ink-secondary">{t`Right-handed`}</figcaption>
      </figure>
      <figure className="flex flex-col items-center">
        {left}
        <figcaption className="mt-1 text-caption text-ink-secondary">{t`Left-handed`}</figcaption>
      </figure>
    </div>
  );
}

// --- Frames ----------------------------------------------------------------

/** Frames as a scoresheet draws them: a box each, with a small box per ball
 *  along its top. Three balls is the tenth frame. */
function Frames({ frames }: { frames: string[][] }) {
  return (
    <div aria-hidden="true" className="type-cap-dense flex">
      {frames.map((balls, i) => (
        <div
          key={i}
          className={`flex h-10 flex-col border border-edge bg-surface ${i > 0 ? "-ml-px" : ""} ${
            balls.length === 3 ? "w-[4.5rem]" : "w-12"
          } ${i === 0 ? "rounded-l-md" : ""} ${i === frames.length - 1 ? "rounded-r-md" : ""}`}
        >
          <div className="flex justify-end">
            {(balls.length === 1 ? ["", balls[0]] : balls).map((mark, j) => (
              <span
                key={j}
                className="flex h-5 w-5 items-center justify-center border-b border-l border-edge text-footnote font-bold text-ink"
              >
                {mark}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- The lane --------------------------------------------------------------

// A lane from above, foul line on the left, 4 units to a foot: 12 feet of
// approach, then 60 feet of lane to the pins. Board 1 runs along the bottom,
// as it does for a right-hander looking down the lane.
const FT = 4;
const APPROACH = 12;
const X = (ft: number) => (APPROACH + ft) * FT;
const BOARD_H = 1.2;
const TOP = 6;
const Y = (board: number) => TOP + (39 - board + 0.5) * BOARD_H;
const LANE_H = 39 * BOARD_H;

const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35];
const SPOT_BOARDS = [3, 5, 8, 11, 14, 26, 29, 32, 35, 37];

function Lane({ part, label }: { part: LanePart; label: string }) {
  const lit = (p: LanePart | LanePart[]) => (Array.isArray(p) ? p.includes(part) : p === part);
  const zone = (from: number, to: number) => (
    <rect x={X(from)} y={TOP} width={(to - from) * FT} height={LANE_H} className="fill-accent" opacity={0.28} />
  );
  return (
    <svg viewBox="0 0 296 60" role="img" aria-label={label} className="h-auto w-full max-w-md">
      {/* Approach, then the lane. */}
      <rect x={0} y={TOP} width={X(0)} height={LANE_H} className={lit("approach") ? "fill-accent" : "fill-surface-muted"} opacity={lit("approach") ? 0.35 : 1} />
      <rect x={X(0)} y={TOP} width={60 * FT} height={LANE_H} className="fill-surface-muted" />

      {/* Oil, drawn first so the markings sit on it. */}
      {lit(["oil", "crown", "breakdown", "carry-down"]) && (
        <>
          <rect x={X(0)} y={Y(37)} width={30 * FT} height={Y(3) - Y(37)} className="fill-warning-700" opacity={0.15} />
          <rect x={X(0)} y={Y(30)} width={40 * FT} height={Y(10) - Y(30)} className="fill-warning-700" opacity={0.28} />
        </>
      )}
      {lit("sport") && (
        <rect x={X(0)} y={Y(38)} width={40 * FT} height={Y(2) - Y(38)} className="fill-warning-700" opacity={0.25} />
      )}
      {lit("breakdown") && (
        <rect x={X(0)} y={Y(13)} width={40 * FT} height={Y(8) - Y(13)} className="fill-surface-muted" />
      )}
      {lit("carry-down") && (
        <rect x={X(40)} y={Y(14)} width={10 * FT} height={Y(8) - Y(14)} className="fill-warning-700" opacity={0.18} />
      )}

      {lit("heads") && zone(0, 16)}
      {lit("mids") && zone(16, 40)}
      {lit("backend") && zone(40, 60)}

      {/* Boards: every fifth drawn faintly always, each one when it is the point. */}
      {Array.from({ length: 38 }, (_, i) => i + 1)
        .filter((b) => lit("boards") || b % 5 === 0)
        .map((b) => (
          <line
            key={b}
            x1={X(0)}
            x2={X(60)}
            y1={Y(b) - BOARD_H / 2}
            y2={Y(b) - BOARD_H / 2}
            className={lit("boards") ? "stroke-accent" : "stroke-edge"}
            strokeWidth={lit("boards") ? 0.3 : 0.25}
          />
        ))}
      {lit("boards") && (
        <>
          <text x={X(1)} y={Y(1) + 0.6} className="fill-accent" style={{ fontSize: 4, fontWeight: 700 }}>1</text>
          <text x={X(1)} y={Y(39) + 3} className="fill-accent" style={{ fontSize: 4, fontWeight: 700 }}>39</text>
        </>
      )}

      {/* Spots and arrows. */}
      {SPOT_BOARDS.map((b) => (
        <circle key={b} cx={X(6.5)} cy={Y(b)} r={lit("spots") ? 1.1 : 0.6} className={lit("spots") ? "fill-accent" : "fill-ink-tertiary"} />
      ))}
      {ARROW_BOARDS.map((b) => {
        const ft = 16 - Math.abs(20 - b) * 0.12;
        const x = X(ft);
        const y = Y(b);
        const big = lit("arrows");
        return (
          <path
            key={b}
            d={`M ${x + (big ? 3 : 2)} ${y} L ${x - (big ? 2 : 1.4)} ${y - (big ? 1.6 : 1)} L ${x - (big ? 2 : 1.4)} ${y + (big ? 1.6 : 1)} z`}
            className={big ? "fill-accent" : "fill-ink-tertiary"}
          />
        );
      })}

      {/* The foul line, and the pins at the far end. */}
      <line x1={X(0)} x2={X(0)} y1={TOP} y2={TOP + LANE_H} className={lit("foul-line") ? "stroke-accent" : "stroke-ink-tertiary"} strokeWidth={lit("foul-line") ? 2 : 0.8} />
      {[[60, 20], [61, 18.5], [61, 21.5], [62, 17], [62, 20], [62, 23], [63, 15.5], [63, 18.5], [63, 21.5], [63, 24.5]].map(([ft, b], i) => (
        <circle key={i} cx={X(ft) - 8} cy={Y(b)} r={0.9} className="fill-ink" />
      ))}

      {lit("breakpoint") && (
        <>
          <path d={`M ${X(0)} ${Y(15)} Q ${X(30)} ${Y(5)} ${X(42)} ${Y(7)} Q ${X(52)} ${Y(9)} ${X(60) - 8} ${Y(18.5)}`} fill="none" className="stroke-accent" strokeWidth={0.9} strokeDasharray="2 1.4" />
          <circle cx={X(42)} cy={Y(7)} r={2} className="fill-accent" />
        </>
      )}

      {/* The gutters. */}
      <rect x={X(0)} y={TOP - 3} width={60 * FT} height={3} className="fill-edge" opacity={0.5} />
      <rect x={X(0)} y={TOP + LANE_H} width={60 * FT} height={3} className="fill-edge" opacity={0.5} />
    </svg>
  );
}
