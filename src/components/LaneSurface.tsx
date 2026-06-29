import type { Handedness, LineSpec, PinNumber } from "../types/bowling";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, POCKET_BOARD,
  boardToX, feetToY, buildLinePath, arrowFeet, DEFAULT_BREAKPOINT_FEET
} from "../lib/laneGeometry";
import { PIN_POSITIONS } from "../lib/pinGeometry";

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35]; // 7 arrows

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
  const leaveSet = new Set(leave ?? []);
  const hasLeave = (leave?.length ?? 0) > 0;
  const path = buildLinePath(line, hand, hasLeave); // spares (a leave) curve to the final
  // Draw the deck back-to-front (deepest pins first) so nearer pins overlap the
  // ones behind them — the overlap reads as depth instead of a flat smear.
  const deckOrder = [...ALL_PINS].sort((a, b) => PIN_POSITIONS[b].feet - PIN_POSITIONS[a].feet);
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

      {!hasLeave && (
        <circle cx={boardToX(17.5, hand)} cy={feetToY(60)} r="10" fill="url(#pocket-glow)" />
      )}

      {/* Pin deck. Centres stay at the real board/feet (so the ball path lands on
          them and the aim math is honest); only the glyph is sized for a legible,
          proportioned rack. Standing leave pins read bright; the rest ghost out. */}
      {deckOrder.map((p) => {
        const pos = PIN_POSITIONS[p];
        // PIN_POSITIONS is board-1-left; a right-hander's boards mirror about
        // centre so the 10-pin draws on the right (matching the line boards).
        const pinBoard = hand === "right" ? LANE_BOARDS + 1 - pos.board : pos.board;
        const cx = boardToX(pinBoard, hand);
        const cy = feetToY(pos.feet);
        const standing = !hasLeave || leaveSet.has(p);
        // A standing pin the ball can't reach (focal lands too far off) reads red.
        const missed = standing && (path?.miss ?? false);
        const r = 4.2;
        return (
          <g key={p} data-role="pin" data-standing={standing ? "true" : "false"} data-missed={missed ? "true" : "false"}>
            <ellipse cx={cx} cy={cy + r * 0.55} rx={r * 0.95} ry={r * 0.4}
              fill="#000000" opacity={standing ? 0.28 : 0.12} />
            <circle cx={cx} cy={cy} r={r}
              fill={missed ? "#ef4444" : standing ? "#f8fafc" : "#5b4733"}
              fillOpacity={standing ? 1 : 0.3}
              stroke={standing ? "#0f172a" : "#3a2a1a"}
              strokeOpacity={standing ? 0.45 : 0.25}
              strokeWidth="0.5" />
            {standing && (
              <>
                <ellipse cx={cx} cy={cy - r * 0.32} rx={r * 0.55} ry={r * 0.4}
                  fill="#ffffff" opacity="0.85" />
                <rect x={cx - r * 0.55} y={cy - r * 0.18} width={r * 1.1} height={r * 0.28}
                  rx={r * 0.14} fill="#e11d48" opacity="0.85" />
              </>
            )}
          </g>
        );
      })}

      {path?.focal && (
        <path
          data-role="focal-line"
          d={path.focal}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.5"
          strokeWidth="0.9"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      )}

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
        <circle data-role="ball" r="3" cx={path.points.final.x} cy={path.points.final.y} fill="#1f2937" />
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
          <Marker p={path.points.final} label={`Final ${line?.final_board ?? POCKET_BOARD}`} />
        </g>
      )}
    </svg>
  );
}

function Marker({ p, label }: { p: { x: number; y: number }; label: string }) {
  return (
    <g data-role="marker">
      <circle cx={p.x} cy={p.y} r="3" fill="#f59e0b" stroke="#fff" strokeWidth="0.8" />
      <text
        x={p.x}
        y={p.y - 5}
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="800"
        fill="#0f172a"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth="1.6"
      >
        {label}
      </text>
    </g>
  );
}
