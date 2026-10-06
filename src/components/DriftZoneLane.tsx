import { useRef, type KeyboardEvent, type PointerEvent } from "react";
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

/** The inverse of `edgeX`, snapped to the half board the model is stored in. */
const xToEdge = (x: number, hand: Handedness): number => {
  const edge = hand === "right" ? (W - x) / COL : x / COL;
  return Math.round(edge * 2) / 2;
};

/** Where the drag grips sit: below the drift arrows, above the locator dots. */
const GRIP_Y = H - 66;

type Edge = "outside" | "inside";

interface DriftZoneLaneProps {
  model: DriftModel;
  hand: Handedness;
  /** Present when the zone edges are draggable. The values are unclamped; the
   *  owner keeps the middle zone open. */
  onOutsideMaxChange?: (value: number) => void;
  onInsideMinChange?: (value: number) => void;
}

/**
 * The approach at the foul line, seen from behind the bowler: 39 board columns
 * with the locator dots, tinted into the three drift zones. Each band carries an
 * arrow showing which way that zone's drift walks the slide foot, the same
 * direction word the stepper below it shows.
 *
 * With the change handlers, the two edges between the zones are the control:
 * a drag anywhere on the approach moves whichever edge is nearer, and each edge
 * is a slider for the keyboard. That replaced two "ends at board" steppers,
 * which asked for a number the picture above them already showed.
 */
export function DriftZoneLane({ model, hand, onOutsideMaxChange, onInsideMinChange }: DriftZoneLaneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<Edge | null>(null);
  const editable = Boolean(onOutsideMaxChange && onInsideMinChange);

  // Both edges as the board edge they are drawn at: the inside zone starts on
  // the board after its edge.
  const edges: Record<Edge, number> = { outside: model.outside_max, inside: model.inside_min - 1 };
  const moveEdge = (edge: Edge, boardEdge: number) => {
    if (edge === "outside") onOutsideMaxChange?.(boardEdge);
    else onInsideMinChange?.(boardEdge + 1);
  };

  const pointerEdge = (e: PointerEvent<SVGSVGElement>): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || !Number.isFinite(e.clientX)) return null;
    return xToEdge(((e.clientX - rect.left) / rect.width) * W, hand);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const at = pointerEdge(e);
    if (at === null) return;
    const edge: Edge = Math.abs(at - edges.outside) <= Math.abs(at - edges.inside) ? "outside" : "inside";
    dragging.current = edge;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveEdge(edge, at);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const at = pointerEdge(e);
    if (at !== null) moveEdge(dragging.current, at);
  };
  const endDrag = () => {
    dragging.current = null;
  };

  // The arrows move the edge the way they point on screen, so they mirror for a
  // left-hander, whose board 1 is on the left.
  const onKeyDown = (edge: Edge) => (e: KeyboardEvent<SVGGElement>) => {
    const physical = hand === "right" ? -0.5 : 0.5;
    const step =
      e.key === "ArrowRight" ? physical : e.key === "ArrowLeft" ? -physical : e.key === "ArrowUp" ? 0.5 : e.key === "ArrowDown" ? -0.5 : 0;
    if (!step) return;
    e.preventDefault();
    moveEdge(edge, edges[edge] + step);
  };

  const bands = [
    { zone: "outside" as const, from: 0, to: model.outside_max },
    { zone: "middle" as const, from: model.outside_max, to: model.inside_min - 1 },
    { zone: "inside" as const, from: model.inside_min - 1, to: BOARDS }
  ];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none rounded-xl border border-edge bg-surface"
      // A group, not an image, once the edges are sliders: an image's children
      // are presentational, which would hide the sliders from a screen reader.
      role={editable ? "group" : "img"}
      aria-label={`Approach board diagram for a ${hand}-handed bowler, split into outside, middle and inside drift zones`}
      // Vertical swipes still scroll the page; sideways ones drag an edge.
      style={editable ? { touchAction: "pan-y", cursor: "ew-resize" } : undefined}
      onPointerDown={editable ? onPointerDown : undefined}
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? endDrag : undefined}
      onPointerCancel={editable ? endDrag : undefined}
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

      {editable &&
        (["outside", "inside"] as const).map((edge) => {
          const x = edgeX(edges[edge], hand);
          const board = edge === "outside" ? model.outside_max : model.inside_min;
          return (
            <g
              key={edge}
              role="slider"
              tabIndex={0}
              aria-label={edge === "outside" ? "Outside zone ends at board" : "Inside zone starts at board"}
              aria-valuenow={board}
              aria-valuemin={edge === "outside" ? 1 : model.outside_max + 2}
              aria-valuemax={edge === "outside" ? model.inside_min - 2 : BOARDS}
              aria-valuetext={`Board ${board}`}
              aria-orientation="horizontal"
              onKeyDown={onKeyDown(edge)}
              className="outline-none [&:focus-visible>rect]:stroke-[#2563eb]"
            >
              <line x1={x} x2={x} y1={FOUL_H} y2={H} stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" />
              <rect x={x - 8} y={GRIP_Y - 15} width={16} height={30} rx={8} fill="#ffffff" stroke="#334155" strokeWidth={1.5} />
              <line x1={x - 2.5} x2={x - 2.5} y1={GRIP_Y - 6} y2={GRIP_Y + 6} stroke="#64748b" strokeWidth={1.5} />
              <line x1={x + 2.5} x2={x + 2.5} y1={GRIP_Y - 6} y2={GRIP_Y + 6} stroke="#64748b" strokeWidth={1.5} />
            </g>
          );
        })}
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
