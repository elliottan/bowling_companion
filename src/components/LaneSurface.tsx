import type { Handedness, LineSpec, PinNumber } from "../types/bowling";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, LANE_FEET,
  boardToX, feetToY, xToBoard, yToFeet, buildLinePath, arrowFeet
} from "../lib/laneGeometry";
import { PIN_POSITIONS } from "../lib/pinGeometry";

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35]; // 7 arrows / ruler ticks
// Plane-units between decorative pin-deck rows. Purely presentational, it
// scales the rack, never the geometry (see the deck comment below). True to
// scale would be ~14.5 (rows sit 10.4in apart, columns 12in ≈ 16.8 units), but
// that deck would eat ~10ft of drawn lane. The ceiling is ~6.1: the back row
// sits 3 × DY above feetToY(60), which is only 21.7 units below the top of the
// plane, and the pin radius (3.4) has to clear it. 6 is that ceiling, rounded.
const RACK_ROW_DY = 6;

// Distinct colour per marker so the four pegs read apart at a glance.
const PEG_COLOR = {
  laydown: "#38bdf8", // sky
  target: "#f59e0b",  // amber (matches the ball path)
  breakpoint: "#c084fc", // violet, derived, rides the rail
  final: "#34d399",   // emerald, the pocket / pin target
} as const;

interface LaneSurfaceProps {
  line: LineSpec | undefined;
  hand: Handedness;
  /** Standing leave to light up (spare surface). */
  leave?: PinNumber[];
  /** Rendered markers can be toggled off for a lighter preview. */
  showMarkers?: boolean;
  animate?: boolean;
  /** Bump to replay the rolling-ball animation (remounts it). */
  animateKey?: number;
  /** Derived slide-foot board (ADR-030), a small, non-interactive foul-line tick,
   *  lighter than the draggable pegs. Omitted when there's no stance to derive from. */
  slideBoard?: number;
  /** Tap a standing pin to set Final to its board (spare mode: leave pins only). */
  onPinTap?: (hit: { board: number; feet: number; pin: PinNumber }) => void;
}

export function LaneSurface({ line, hand, leave, showMarkers = true, animate, animateKey = 0, slideBoard, onPinTap }: LaneSurfaceProps) {
  const leaveSet = new Set(leave ?? []);
  const hasLeave = (leave?.length ?? 0) > 0;
  const path = buildLinePath(line, hand, hasLeave); // spares (a leave) curve to the final
  // Draw the deck back-to-front (deepest pins first) so nearer pins overlap the
  // ones behind them, the overlap reads as depth instead of a flat smear.
  const deckOrder = [...ALL_PINS].sort((a, b) => PIN_POSITIONS[b].feet - PIN_POSITIONS[a].feet);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Marker labels, dodged vertically so nearby pegs don't overprint each other.
  const markers = showMarkers && path ? buildMarkers(line, hand, path) : [];

  return (
    <svg
      viewBox={`0 0 ${PLANE_W} ${PLANE_L}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-label="Bowling lane line diagram"
    >
      <defs>
        <linearGradient id="lane-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f4220" />
          <stop offset="0.16" stopColor="#a9713a" />
          <stop offset="0.6" stopColor="#c8974f" />
          <stop offset="1" stopColor="#dcac68" />
        </linearGradient>
        <linearGradient id="lane-oil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.2" />
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

      {/* Gutter shadows down each edge, so the lane reads as a bounded surface. */}
      <rect x="0" y="0" width="2.4" height={feetToY(0)} fill="#000000" opacity="0.28" />
      <rect x={PLANE_W - 2.4} y="0" width="2.4" height={feetToY(0)} fill="#000000" opacity="0.28" />

      {/* Foul line */}
      <line x1="0" y1={feetToY(0)} x2={PLANE_W} y2={feetToY(0)} stroke="#1a120a" strokeOpacity="0.6" strokeWidth="0.8" />

      {Array.from({ length: LANE_BOARDS - 1 }, (_, i) => {
        const x = boardToX(i + 1.5, hand);
        return <line key={i} x1={x} y1="0" x2={x} y2={feetToY(0)} stroke="#000000" strokeOpacity="0.06" strokeWidth="0.3" />;
      })}

      {/* Board ruler: labelled ticks just below the foul line so drags read in boards. */}
      {ARROW_BOARDS.map((b) => {
        const x = boardToX(b, hand);
        const yBase = feetToY(0);
        return (
          <g key={`ruler-${b}`} data-role="ruler-tick">
            <line x1={x} y1={yBase} x2={x} y2={yBase + 3} stroke="#f8ecd8" strokeOpacity="0.4" strokeWidth="0.5" />
            <text
              x={x} y={yBase + 8} textAnchor="middle" fontSize="5.5"
              fontWeight={b === 20 ? 800 : 600}
              fill="#f8ecd8" fillOpacity={b === 20 ? 0.85 : 0.55}
            >
              {b}
            </text>
          </g>
        );
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

      {/* Pin deck (ADR-020): a decorative, fixed-scale rack. Columns stay at the
          real (mirrored) board so the ball path lands in the right pin's column;
          rows are spread on their OWN vertical scale (RACK_ROW_DY), NOT feetToY , 
          the real deck is only 2.6 ft and feetToY is now linear, so it would smear.
          The rack is anchored at the head-pin row. Standing leave pins read bright;
          the rest ghost out. */}
      {deckOrder.map((p) => {
        const pos = PIN_POSITIONS[p];
        // PIN_POSITIONS is board-1-left; a right-hander's boards mirror about
        // centre so the 10-pin draws on the right (matching the line boards).
        const pinBoard = hand === "right" ? LANE_BOARDS + 1 - pos.board : pos.board;
        const row = Math.round((pos.feet - LANE_FEET) / 0.866); // 0 = head pin … 3 = back row
        const cx = boardToX(pinBoard, hand);
        const cy = feetToY(LANE_FEET) - row * RACK_ROW_DY;
        const standing = !hasLeave || leaveSet.has(p);
        // A standing pin the ball can't reach (focal lands too far off) reads red.
        const missed = standing && (path?.miss ?? false);
        const r = 3.4;
        return (
          <g key={p} data-role="pin" data-standing={standing ? "true" : "false"} data-missed={missed ? "true" : "false"}>
            <ellipse cx={cx} cy={cy + r * 0.6} rx={r * 0.95} ry={r * 0.4}
              fill="#000000" opacity={standing ? 0.3 : 0.12} />
            <circle cx={cx} cy={cy} r={r}
              fill={missed ? "#ef4444" : standing ? "#f8fafc" : "#5b4733"}
              fillOpacity={standing ? 1 : 0.3}
              stroke={missed ? "#7f1d1d" : standing ? "#0f172a" : "#3a2a1a"}
              strokeOpacity={standing ? 0.45 : 0.25}
              strokeWidth="0.5" />
            {standing && (
              <>
                <ellipse cx={cx} cy={cy - r * 0.34} rx={r * 0.55} ry={r * 0.4}
                  fill="#ffffff" opacity="0.9" />
                <rect x={cx - r * 0.55} y={cy - r * 0.18} width={r * 1.1} height={r * 0.28}
                  rx={r * 0.14} fill={missed ? "#b91c1c" : "#e11d48"} opacity="0.85" />
              </>
            )}
            {onPinTap && standing && (
              <circle
                data-role="pin-hit"
                data-pin={p}
                cx={cx}
                cy={cy}
                r="4"
                fill="transparent"
                className="cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onPinTap({ board: pinBoard, feet: pos.feet, pin: p })}
              />
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
        <circle key={animateKey} data-role="ball" r="3" fill="#f59e0b" stroke="#fff" strokeWidth="0.8" opacity="0.95">
          <animateMotion dur="1.4s" repeatCount="1" fill="freeze" path={path.d} />
          {/* Fade out at the pins, a frozen resting dot read as a mystery marker. */}
          <animate attributeName="opacity" begin="1.5s" dur="0.35s" from="0.95" to="0" fill="freeze" />
        </circle>
      )}

      {slideBoard != null && (
        <g data-role="slide-tick" aria-hidden="true">
          <circle
            cx={boardToX(slideBoard, hand)}
            cy={feetToY(0)}
            r="2"
            fill="#94a3b8"
            fillOpacity="0.55"
            stroke="#fff"
            strokeOpacity="0.35"
            strokeWidth="0.4"
          />
          <text
            x={boardToX(slideBoard, hand)}
            y={feetToY(0) + 8}
            textAnchor="middle"
            fontSize="4.5"
            fontWeight="600"
            fill="#e2e8f0"
            fillOpacity="0.55"
          >
            slide
          </text>
        </g>
      )}

      {markers.map(({ key, ...m }) => (
        <Marker key={key} {...m} />
      ))}
    </svg>
  );
}

interface MarkerData {
  key: string;
  p: { x: number; y: number };
  label: string;
  color: string;
  labelY: number;
  labelX: number;
  anchor: "start" | "middle" | "end";
}

/** Build the peg markers with dodged label positions (nearby pegs would otherwise
 *  overprint their labels). Labels sit above their point, pushed apart top-down. */
function buildMarkers(line: LineSpec | undefined, hand: Handedness, path: NonNullable<ReturnType<typeof buildLinePath>>): MarkerData[] {
  const list: Omit<MarkerData, "labelY" | "labelX" | "anchor">[] = [
    { key: "laydown", p: path.points.laydown, color: PEG_COLOR.laydown, label: `Laydown ${line?.laydown ?? line?.stance}` },
    { key: "target", p: path.points.target, color: PEG_COLOR.target, label: `Target ${line?.target}` },
  ];
  if (path.points.breakpoint) {
    list.push({
      key: "breakpoint",
      p: path.points.breakpoint,
      color: PEG_COLOR.breakpoint,
      // Derived: the curve's rightmost point (ADR-024), not a stored input.
      label: `Break ${Math.round(xToBoard(path.points.breakpoint.x, hand) * 2) / 2}·${Math.round(yToFeet(path.points.breakpoint.y))}ft`,
    });
  }
  // Read the board off the drawn point, not the stored final_board: on an
  // unreachable aim the ball rides the focal and finishes elsewhere, and the
  // label has to agree with where the dot actually sits.
  list.push({
    key: "final",
    p: path.points.final,
    color: PEG_COLOR.final,
    label: `Final ${Math.round(xToBoard(path.points.final.x, hand) * 2) / 2}`,
  });

  // Dodge labels: process top-first, keep each at least MIN_GAP below the previous.
  const MIN_GAP = 11;
  const ordered = [...list].sort((a, b) => a.p.y - b.p.y);
  const labelY = new Map<string, number>();
  let last = -Infinity;
  for (const m of ordered) {
    let ly = m.p.y - 6;
    if (ly - last < MIN_GAP) ly = last + MIN_GAP;
    labelY.set(m.key, ly);
    last = ly;
  }
  // Near a lane edge, anchor the label so it grows inward instead of clipping off
  // (common for edge spares, the 7/10-pin sit on board ~3 at the very edge).
  const EDGE = 28;
  return list.map((m) => {
    let anchor: MarkerData["anchor"] = "middle";
    let labelX = m.p.x;
    if (m.p.x > PLANE_W - EDGE) { anchor = "end"; labelX = PLANE_W - 1; }
    else if (m.p.x < EDGE) { anchor = "start"; labelX = 1; }
    return { ...m, labelY: labelY.get(m.key)!, labelX, anchor };
  });
}

function Marker({ p, label, color, labelY, labelX, anchor }: Omit<MarkerData, "key">) {
  return (
    <g data-role="marker">
      {labelY < p.y - 7 && (
        <line x1={p.x} y1={p.y - 4} x2={p.x} y2={labelY + 1} stroke={color} strokeOpacity="0.5" strokeWidth="0.5" />
      )}
      <circle cx={p.x} cy={p.y} r="2.8" fill={color} stroke="#fff" strokeWidth="0.8" />
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        fontSize="6"
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
