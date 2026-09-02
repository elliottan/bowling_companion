import type { Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";

/** Zone accent colours, shared with the settings rows so the band a bowler sees
 *  on the lane and the row they edit read as the same thing. */
export const ZONE_ACCENT = {
  outside: { fill: "#0ea5e9", swatch: "bg-sky-500", text: "text-sky-700" },
  middle: { fill: "#10b981", swatch: "bg-emerald-500", text: "text-emerald-700" },
  inside: { fill: "#f97316", swatch: "bg-orange-500", text: "text-orange-700" }
} as const;

const BOARDS = 39;
const W = 390;
const COL = W / BOARDS;
const FOUL_H = 6;
const H = 168;

/** Approach locator dots, in boards. Symmetric about board 20, so the same set
 *  serves both hands without mirroring. */
const DOT_BOARDS = [5, 10, 15, 20, 25, 30, 35];

/** Hand-relative board edge → x. Board 1 hugs the right edge for a right-hander
 *  and the left edge for a left-hander, matching `boardToX` in laneGeometry. */
const edgeX = (boardEdge: number, hand: Handedness): number =>
  hand === "right" ? W - boardEdge * COL : boardEdge * COL;

interface DriftZoneLaneProps {
  model: DriftModel;
  hand: Handedness;
}

/**
 * The approach at the foul line, seen from behind the bowler: 39 board columns
 * with the locator dots, tinted into the three drift zones. Each band carries an
 * arrow showing which way that zone's drift walks the slide foot, the same
 * direction word the stepper below it shows.
 */
export function DriftZoneLane({ model, hand }: DriftZoneLaneProps) {
  const bands = [
    { zone: "outside" as const, from: 0, to: model.outside_max },
    { zone: "middle" as const, from: model.outside_max, to: model.inside_min - 1 },
    { zone: "inside" as const, from: model.inside_min - 1, to: BOARDS }
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full rounded-xl border border-edge bg-surface"
      role="img"
      aria-label={`Approach board diagram for a ${hand}-handed bowler, split into outside, middle and inside drift zones`}
    >
      {/* Maple approach. The foul line runs across the top, the lane is beyond it. */}
      <rect x={0} y={FOUL_H} width={W} height={H - FOUL_H} fill="#efe6d3" />
      <rect x={0} y={0} width={W} height={FOUL_H} fill="#1e293b" />

      {/* Board seams. */}
      {Array.from({ length: BOARDS - 1 }, (_, i) => (
        <line
          key={i}
          x1={(i + 1) * COL}
          x2={(i + 1) * COL}
          y1={FOUL_H}
          y2={H}
          stroke="#d8c8a4"
          strokeWidth={0.75}
        />
      ))}

      {bands.map(({ zone, from, to }) => {
        const x1 = edgeX(from, hand);
        const x2 = edgeX(to, hand);
        const left = Math.min(x1, x2);
        const width = Math.abs(x2 - x1);
        const mid = left + width / 2;
        const drift = model.drift[zone];
        const dir = driftDirection(drift, hand);
        const accent = ZONE_ACCENT[zone].fill;
        return (
          <g key={zone}>
            <rect x={left} y={FOUL_H} width={width} height={H - FOUL_H} fill={accent} opacity={0.16} />
            <line x1={left} x2={left + width} y1={FOUL_H} y2={FOUL_H} stroke={accent} strokeWidth={3} />
            <text
              x={mid}
              y={FOUL_H + 22}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill="#334155"
              className="capitalize"
            >
              {zone}
            </text>
            <DriftArrow x={mid} y={FOUL_H + 52} drift={drift} dir={dir} accent={accent} span={width} />
          </g>
        );
      })}

      {/* Locator dots. */}
      {DOT_BOARDS.map((b) => (
        <circle key={b} cx={edgeX(b - 0.5, hand)} cy={H - 44} r={4} fill="#8b7a55" />
      ))}

      {/* Board numbers under the dots. */}
      {DOT_BOARDS.map((b) => (
        <text
          key={b}
          x={edgeX(b - 0.5, hand)}
          y={H - 22}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="#78716c"
        >
          {b}
        </text>
      ))}

      {/* Which physical side is which, so the mirroring is never a guess. */}
      <text x={8} y={H - 5} fontSize={10} fontWeight={600} fill="#94a3b8">
        ← left
      </text>
      <text x={W - 8} y={H - 5} textAnchor="end" fontSize={10} fontWeight={600} fill="#94a3b8">
        right →
      </text>
    </svg>
  );
}

/** Arrow showing which way a zone's drift moves the slide foot. Length scales
 *  with the magnitude but is capped to its band so it never bleeds into a
 *  neighbour. Zero drift draws a dot instead of a zero-length arrow. */
function DriftArrow({
  x,
  y,
  drift,
  dir,
  accent,
  span
}: {
  x: number;
  y: number;
  drift: number;
  dir: "left" | "right" | "none";
  accent: string;
  span: number;
}) {
  const label = dir === "none" ? "no drift" : `${Math.abs(drift)} ${dir}`;
  if (dir === "none") {
    return (
      <g>
        <circle cx={x} cy={y} r={4} fill={accent} />
        <text x={x} y={y + 22} textAnchor="middle" fontSize={11} fontWeight={600} fill="#475569">
          {label}
        </text>
      </g>
    );
  }
  const len = Math.min(Math.abs(drift) * 8 + 10, Math.max(span / 2 - 6, 10));
  const sign = dir === "right" ? 1 : -1;
  const tip = x + sign * len;
  return (
    <g>
      <line x1={x - sign * len} x2={tip} y1={y} y2={y} stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <path d={`M ${tip} ${y} L ${tip - sign * 8} ${y - 5} L ${tip - sign * 8} ${y + 5} Z`} fill={accent} />
      <text x={x} y={y + 22} textAnchor="middle" fontSize={11} fontWeight={600} fill="#475569">
        {label}
      </text>
    </g>
  );
}
