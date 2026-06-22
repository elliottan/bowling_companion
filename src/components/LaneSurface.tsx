import type { Handedness, LineSpec, PinNumber } from "../types/bowling";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, ARROWS_FEET,
  boardToX, feetToY, buildLinePath, DEFAULT_BREAKPOINT_FEET
} from "../lib/laneGeometry";
import { PIN_POSITIONS } from "../lib/pinGeometry";

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35]; // 7 arrows
// Real arrows form a chevron: the centre arrow (board 20) sits furthest
// down-lane, the outer ones step back toward the foul line.
const arrowFeet = (board: number) => ARROWS_FEET + 1 - (Math.abs(board - 20) / 15) * 4;

interface LaneSurfaceProps {
  line: LineSpec | undefined;
  hand: Handedness;
  /** Standing leave to light up (spare surface). */
  leave?: PinNumber[];
  /** Rendered markers can be toggled off for a lighter preview. */
  showMarkers?: boolean;
  animate?: boolean;
}

export function LaneSurface({ line, hand, leave, showMarkers = true, animate }: LaneSurfaceProps) {
  const path = buildLinePath(line, hand);
  const leaveSet = new Set(leave ?? []);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <svg
      viewBox={`0 0 ${PLANE_W} ${PLANE_L}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-label="Bowling lane line diagram"
    >
      <defs>
        <linearGradient id="lane-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c4a21" />
          <stop offset="0.18" stopColor="#b07a3e" />
          <stop offset="1" stopColor="#d8a564" />
        </linearGradient>
        <linearGradient id="lane-oil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="0.66" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pocket-glow">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Approach (below the foul line) as a darker base, then the lane wood on top. */}
      <rect x="0" y="0" width={PLANE_W} height={PLANE_L} fill="#2e1f12" />
      <rect x="0" y="0" width={PLANE_W} height={feetToY(0)} fill="url(#lane-wood)" />
      <rect x="0" y={feetToY(45)} width={PLANE_W} height={feetToY(0) - feetToY(45)} fill="url(#lane-oil)" />
      {/* Foul line */}
      <line x1="0" y1={feetToY(0)} x2={PLANE_W} y2={feetToY(0)} stroke="#1a120a" strokeOpacity="0.6" strokeWidth="0.8" />

      {Array.from({ length: LANE_BOARDS - 1 }, (_, i) => {
        const x = boardToX(i + 1.5, hand);
        return <line key={i} x1={x} y1="0" x2={x} y2={feetToY(0)} stroke="#000000" strokeOpacity="0.06" strokeWidth="0.3" />;
      })}

      {ARROW_BOARDS.map((b) => {
        const x = boardToX(b, hand);
        const y = feetToY(arrowFeet(b));
        return (
          <polygon
            key={b}
            data-role="arrow"
            points={`${x},${y - 3} ${x - 1.6},${y + 2} ${x + 1.6},${y + 2}`}
            fill="#3f2a12"
            fillOpacity="0.65"
          />
        );
      })}

      <circle cx={boardToX(17.5, hand)} cy={feetToY(60)} r="10" fill="url(#pocket-glow)" />

      {ALL_PINS.map((p) => {
        const pos = PIN_POSITIONS[p];
        const standing = leaveSet.has(p);
        return (
          <circle
            key={p}
            data-role="pin"
            data-standing={standing ? "true" : "false"}
            cx={boardToX(pos.board, hand)}
            cy={feetToY(pos.feet)}
            r="2.2"
            fill={standing ? "#0f766e" : "#f8fafc"}
            stroke="#0f172a"
            strokeOpacity="0.25"
            strokeWidth="0.3"
          />
        );
      })}

      {path && (
        <path
          data-role="ball-path"
          d={path.d}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {path && animate && !reduceMotion && (
        <circle data-role="ball" r="3" fill="#1f2937" stroke="#fff" strokeWidth="0.6">
          <animateMotion dur="1.4s" repeatCount="1" fill="freeze" path={path.d} />
        </circle>
      )}
      {path && animate && reduceMotion && (
        <circle data-role="ball" r="3" cx={path.points.pocket.x} cy={path.points.pocket.y} fill="#1f2937" />
      )}

      {showMarkers && path && (
        <g>
          <Marker p={path.points.laydown} label={`Laydown ${line?.laydown ?? line?.stance}`} />
          <Marker p={path.points.target} label={`Target ${line?.target}`} />
          {path.points.breakpoint && (
            <Marker
              p={path.points.breakpoint}
              label={`Bkpt ${line?.breakpoint} · ${line?.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET}ft`}
            />
          )}
        </g>
      )}
    </svg>
  );
}

function Marker({ p, label }: { p: { x: number; y: number }; label: string }) {
  return (
    <g data-role="marker">
      <circle cx={p.x} cy={p.y} r="2.4" fill="#f59e0b" stroke="#fff" strokeWidth="0.6" />
      <text
        x={p.x}
        y={p.y - 4}
        textAnchor="middle"
        fontSize="3.2"
        fontWeight="700"
        fill="#1f2937"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth="0.8"
      >
        {label}
      </text>
    </g>
  );
}
