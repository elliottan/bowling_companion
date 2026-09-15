import { useCallback, useMemo, useRef, useState } from "react";
import type { Handedness } from "../types/bowling";
import {
  DEFAULT_PAP,
  arcToAngle,
  coreToPap,
  formatInches,
  normalize,
  pinBuffer,
  surfaceDistance,
  tangentToward,
  walk,
  type BallSpec,
  type DualAngleLayout,
  type PapMeasurement,
  type Vec3
} from "../lib/ballLayout";
import { layoutGeometry } from "../lib/ballLayout";
import {
  IDENTITY_ORIENTATION,
  KEY_STEP_PX,
  KEY_STEP_WIDTH,
  arcPoints,
  circlePoints,
  dragToOrientation,
  flareAxes,
  project,
  splitByDepth,
  toPolyline,
  type Orientation
} from "../lib/ballProjection";

/**
 * The ball, drawn, with the layout on it, and draggable.
 *
 * Why this is a sphere you turn rather than the flat two-circle diagram every
 * layout chart prints: the flat diagram only works because the reader already
 * knows the pin goes round the back. A bowler learning what a 70 degree VAL
 * angle does needs to see the pin travel, and the moment the drawing is a
 * sphere, "drag it" is the only interaction anyone tries. So the geometry is
 * real 3D (`lib/ballProjection`) and the drag is the primary control.
 *
 * On colour: this is the `docs/DESIGN-LANGUAGE.md` §3 exception that `PinGrid`
 * and `LaneVisualizer` already hold. A bowling ball is a physical object with a
 * colour of its own, a drilled hole is a hole in both themes, and a ball that
 * went slate at night would stop being a ball. The markers and the lines are
 * the app's, so those take the semantic tokens.
 */

interface BallLayoutDiagramProps {
  layout: DualAngleLayout;
  ball: BallSpec;
  pap?: PapMeasurement;
  /** Inches of track flare to draw, from the motion model. Zero hides the rings. */
  flareInches?: number;
  /** Draw the flare rings. Off by default: they are what the layout produces
   *  rather than part of it, and five great circles behind two measured lines
   *  is a lot of ink to put on the ball before anyone asks for it. */
  showFlare?: boolean;
  /** Draw the finger and thumb holes. */
  showGrip?: boolean;
  /** Draw the measured angle at each vertex. */
  showAngles?: boolean;
  /**
   * Which way the ball is turned. Controlled by the parent rather than held
   * here, because "show me the PSA" is a thing the screen around the ball asks
   * for, and a diagram that owned its own orientation could only be told by an
   * effect that fired on a prop change: a render writing back into itself. The
   * parent already holds the layout, so it can hold the one other piece of view
   * state and the data flows one way.
   */
  orientation: Orientation;
  onOrientationChange: (next: Orientation) => void;
  /** Which hand the layout is for. A lefty layout is the mirror image. */
  hand?: Handedness;
  className?: string;
}

// Drawing space. The viewBox is square and the ball is inset enough that a
// label beside a marker on the silhouette still has room to sit.
const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 110;

/** Ball surface colours, lit from the upper left. See the note on §3 above. */
const BALL_LIGHT = "#5b6b84";
const BALL_MID = "#33415c";
const BALL_DARK = "#161e2e";
const HOLE = "#0b0f18";

/** Opacity for anything on the far side of the ball, seen through it. */
const BEHIND = 0.26;

interface Landmark {
  id: string;
  point: Vec3;
  label: string;
  color: string;
  shape: "pin" | "core" | "pap";
}

export function BallLayoutDiagram({
  layout,
  ball,
  pap = DEFAULT_PAP,
  flareInches = 0,
  showFlare = false,
  showGrip = true,
  showAngles = true,
  orientation,
  onOrientationChange,
  hand = "right",
  className = ""
}: BallLayoutDiagramProps) {
  const geometry = useMemo(() => layoutGeometry(layout, ball, pap, hand), [layout, ball, pap, hand]);

  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // The drag's own transform, owned here and never animated against a keyframe
  // (docs/DESIGN-LANGUAGE.md §7).
  const drag = useRef<{ id: number; x: number; y: number; from: Orientation } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: orientation };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [orientation]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Measured against the element's own width, so the ball turns the same
    // amount per finger-travel whatever size it is drawn at.
    const width = svgRef.current?.getBoundingClientRect().width ?? SIZE;
    onOrientationChange(dragToOrientation(d.from, e.clientX - d.x, e.clientY - d.y, width));
  }, [onOrientationChange]);

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  }, []);

  // Keyboard is a first-class way to turn the ball, not an afterthought: the
  // diagram carries information that is only reachable by rotating it, so a
  // pointer-only control would put that information out of reach entirely.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      // Expressed as the drag each key stands for, so the keyboard and the
      // pointer can never disagree about which way is up.
      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        onOrientationChange(dragToOrientation(orientation, dx, dy, KEY_STEP_WIDTH));
      };
      if (e.key === "ArrowLeft") nudge(-KEY_STEP_PX, 0);
      else if (e.key === "ArrowRight") nudge(KEY_STEP_PX, 0);
      else if (e.key === "ArrowUp") nudge(0, -KEY_STEP_PX);
      else if (e.key === "ArrowDown") nudge(0, KEY_STEP_PX);
      else if (e.key === "Home") {
        e.preventDefault();
        onOrientationChange(IDENTITY_ORIENTATION);
      }
    },
    [onOrientationChange, orientation]
  );

  const p = useCallback(
    (v: Vec3) => project(v, orientation, CENTER, CENTER, RADIUS),
    [orientation]
  );

  const stroke = useCallback(
    (points: Vec3[], color: string, width: number, dash?: string, key?: string) =>
      splitByDepth(points, orientation, CENTER, CENTER, RADIUS).map((run, i) => (
        <polyline
          key={`${key}-${i}`}
          points={toPolyline(run)}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={dash}
          strokeLinecap="round"
          opacity={run.front ? 1 : BEHIND}
        />
      )),
    [orientation]
  );

  const landmarks: Landmark[] = [
    { id: "pin", point: geometry.pin, label: "Pin", color: "#f8fafc", shape: "pin" },
    {
      id: "core",
      point: geometry.core,
      label: ball.symmetric ? "CG" : "PSA",
      color: "#fbbf24",
      shape: "core"
    },
    { id: "pap", point: geometry.pap, label: "PAP", color: "#38bdf8", shape: "pap" }
  ];

  const gripHoles = useMemo(
    () => (showGrip ? gripHolePoints(geometry.gripCenter, hand) : []),
    [geometry.gripCenter, hand, showGrip]
  );

  const flareRings = useMemo(
    () =>
      showFlare && flareInches > 0.05
        ? flareAxes(geometry.pap, geometry.pin, flareInches, 5)
        : [],
    [showFlare, flareInches, geometry.pap, geometry.pin]
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={`w-full touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"} ${className}`}
      role="img"
      tabIndex={0}
      aria-label={describeDiagram(layout, ball)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <defs>
        <radialGradient id="ball-body" cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor={BALL_LIGHT} />
          <stop offset="55%" stopColor={BALL_MID} />
          <stop offset="100%" stopColor={BALL_DARK} />
        </radialGradient>
        {/* The rim darkening that makes a flat disc read as a sphere. Without
            it the silhouette is a hard edge and the ball looks like a coin. */}
        <radialGradient id="ball-rim" cx="50%" cy="50%" r="50%">
          <stop offset="82%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        <clipPath id="ball-clip">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} />
        </clipPath>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#ball-body)" />

      <g clipPath="url(#ball-clip)">
        {/* Where the axis comes out, related to where the hand goes: a dotted
            arc from the grip centre to the PAP, and nothing else.

            This used to be two full great circles, the midline and the axis
            line. Both are correct and both are what a layout chart prints, but
            on a sphere you can turn they wrap all the way round the ball and
            read as globe wireframe rather than as a measurement: the question
            a bowler asks here is how far the axis sits from the grip, and one
            short dotted run answers exactly that. The VAL angle keeps its own
            arc at the PAP, which is where that number is measured. */}
        {stroke(arcPoints(geometry.gripCenter, geometry.pap), "#94a3b8", 1.4, "2 4", "grip-pap")}

        {/* Track flare: the circle the ball rolls on for each revolution as the
            axis migrates. Drawn under the layout lines because it is what the
            layout produces, not part of the layout itself.
            
            Kept deliberately faint. These are full great circles, and they are
            correct as full circles (an oiled ball really does show rings that
            pinch together a quarter turn from the migration path). But at the
            weight the layout lines carry, five of them turn the ball into a
            wireframe globe and the two lines that matter disappear into it.
            They are surface markings, so they are drawn like surface
            markings. */}
        <g opacity={0.4}>
          {flareRings.map((axis, i) => (
            <g key={`flare-${i}`}>
              {stroke(circlePoints(axis, perpendicularTo(axis)), "#34d399", 0.9, undefined, `flare-${i}`)}
            </g>
          ))}
        </g>

        {/* The two measured lines of the dual angle system. */}
        {stroke(arcPoints(geometry.pin, geometry.pap), "#f8fafc", 2.4, undefined, "pin-pap")}
        {stroke(arcPoints(geometry.pin, geometry.core), "#fbbf24", 2, "5 3", "pin-core")}

        {/* The ball's own pin-to-PSA (or pin-to-CG) distance, written on the
            line it measures. It is the one number in the drawing that is not a
            layout choice: the core puts it there and the driller works around
            it, which is exactly why it has to be visible. Two balls with the
            same dual angle numbers and different pin-to-PSA distances are
            different layouts, and without this the drawing gives no hint of
            that. */}
        <ArcDistance
          from={geometry.pin}
          to={geometry.core}
          label={`${formatInches(ball.pinToCore)}"`}
          color="#fbbf24"
          orientation={orientation}
        />

        {showAngles && (
          <>
            {/* Vertex at the PAP: pin-to-PAP against the VAL. */}
            <AngleArc
              vertex={geometry.pap}
              a={geometry.pin}
              b={walk(geometry.pap, geometry.valDirection, arcToAngle(2))}
              color="#38bdf8"
              value={Math.round(layout.valAngle)}
              name="VAL"
              orientation={orientation}
            />
            {/* Vertex at the pin: pin-to-PAP against pin-to-core. */}
            <AngleArc
              vertex={geometry.pin}
              a={geometry.pap}
              b={geometry.core}
              color="#fbbf24"
              value={Math.round(layout.drillingAngle)}
              name="DRILL"
              orientation={orientation}
            />
          </>
        )}

        {gripHoles.map((hole, i) => {
          const q = p(hole.point);
          if (!q.front) return null;
          // Squashed toward the silhouette, which is what a round hole does
          // when the surface it sits on turns away.
          return (
            <ellipse
              key={`hole-${i}`}
              cx={q.x}
              cy={q.y}
              rx={hole.r * RADIUS * Math.max(q.facing, 0.12)}
              ry={hole.r * RADIUS}
              transform={`rotate(${holeAngle(q, CENTER)} ${q.x} ${q.y})`}
              fill={HOLE}
              opacity={0.9}
            />
          );
        })}

        {/* The grip centre itself, as a small cross: the dotted arc has to
            start somewhere, and the point it starts from is the one the span
            is laid out around. Small enough not to compete with the pin. */}
        {(() => {
          const q = p(geometry.gripCenter);
          if (!q.front) return null;
          return (
            <g stroke="#cbd5f5" strokeWidth="1.6" strokeLinecap="round" opacity={0.85}>
              <line x1={q.x - 4} y1={q.y} x2={q.x + 4} y2={q.y} />
              <line x1={q.x} y1={q.y - 4} x2={q.x} y2={q.y + 4} />
            </g>
          );
        })()}
      </g>

      {/* Rim shading sits above the surface detail and below the markers. */}
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#ball-rim)" pointerEvents="none" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.5"
        strokeWidth="1"
      />

      {landmarks.map((mark) => {
        const q = p(mark.point);
        return (
          <g key={mark.id} opacity={q.front ? 1 : BEHIND} pointerEvents="none">
            <Marker shape={mark.shape} x={q.x} y={q.y} color={mark.color} />
            {q.front && q.facing > 0.25 && (
              <text
                {...labelAnchor(q.x, q.y)}
                fill={mark.color}
                fontSize="11"
                fontWeight="700"
                opacity={Math.min(1, (q.facing - 0.25) * 4)}
                style={{ paintOrder: "stroke" }}
                stroke="#0f172a"
                strokeWidth="3"
                strokeLinejoin="round"
              >
                {mark.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Marker({ shape, x, y, color }: { shape: Landmark["shape"]; x: number; y: number; color: string }) {
  if (shape === "pap") {
    // A crosshair, because the PAP is a located point rather than a thing
    // moulded into the ball: it is where the bowler's axis comes out.
    return (
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
        <circle cx={x} cy={y} r="6" />
        <line x1={x - 10} y1={y} x2={x - 8} y2={y} />
        <line x1={x + 8} y1={y} x2={x + 10} y2={y} />
        <line x1={x} y1={y - 10} x2={x} y2={y - 8} />
        <line x1={x} y1={y + 8} x2={x} y2={y + 10} />
      </g>
    );
  }
  if (shape === "core") {
    // A diamond: the PSA and the CG are both marks the factory puts on, and a
    // second filled dot would read as a second pin.
    return (
      <g>
        <path
          d={`M ${x} ${y - 6.5} L ${x + 6.5} ${y} L ${x} ${y + 6.5} L ${x - 6.5} ${y} Z`}
          fill={color}
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} r="5.5" fill={color} stroke="#0f172a" strokeWidth="1.5" />
    </g>
  );
}

/**
 * A distance written along the middle of the arc it measures, lifted a little
 * clear of the line so the stroke does not run through the text.
 */
function ArcDistance({
  from,
  to,
  label,
  color,
  orientation
}: {
  from: Vec3;
  to: Vec3;
  label: string;
  color: string;
  orientation: Orientation;
}) {
  const half = surfaceDistance(from, to) / 2;
  const middle = walk(from, tangentToward(from, to), arcToAngle(half));
  // Step off the line, perpendicular to it, so the label clears the stroke.
  // The cross product is written out because ballLayout keeps its own private,
  // and one use does not earn an export.
  const along = tangentToward(middle, to);
  const aside = normalize({
    x: along.y * middle.z - along.z * middle.y,
    y: along.z * middle.x - along.x * middle.z,
    z: along.x * middle.y - along.y * middle.x
  });
  const at = project(walk(middle, aside, arcToAngle(0.6)), orientation, CENTER, CENTER, RADIUS);
  if (!at.front || at.facing < 0.3) return null;

  return (
    <text
      x={at.x}
      y={at.y}
      fill={color}
      fontSize="9"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
      opacity={Math.min(1, (at.facing - 0.3) * 4)}
      stroke="#0f172a"
      strokeWidth="2.5"
      strokeLinejoin="round"
      style={{ paintOrder: "stroke" }}
      pointerEvents="none"
    >
      {label}
    </text>
  );
}

/**
 * The little arc at a vertex that shows the angle being measured, drawn on the
 * ball surface rather than on the screen plane so it sits flat on the sphere
 * and shrinks correctly as the vertex turns away.
 *
 * The two angles of a dual angle layout sit at opposite ends of the pin-to-PAP
 * line and open away from each other, which is the shape the system makes: the
 * drilling angle at the pin swings the core marker one way, the VAL angle at
 * the PAP opens to the axis line the other way. But both wedges open *inward*
 * along that line, so a label on each bisector walks toward the other one. At
 * the reach this used (1.85 inches, about 43 screen units) the two labels ended
 * up 43 units apart on a line only 130 long, huddled in the middle of the ball,
 * and the drawing read as one pair of adjacent angles rather than one angle at
 * each corner. A reader could not tell which vertex either belonged to.
 *
 * So the label is pulled in tight to its own vertex, and carries the angle's
 * name under the degrees. The name is what makes it unambiguous no matter how
 * the ball is turned; the short reach is what keeps the two apart.
 */
function AngleArc({
  vertex,
  a,
  b,
  color,
  value,
  name,
  orientation
}: {
  vertex: Vec3;
  a: Vec3;
  b: Vec3;
  color: string;
  value: number;
  name: string;
  orientation: Orientation;
}) {
  const toA = tangentToward(vertex, a);
  const toB = tangentToward(vertex, b);
  const reach = arcToAngle(0.8);
  const start = walk(vertex, toA, reach);
  const end = walk(vertex, toB, reach);
  const runs = splitByDepth(arcPoints(start, end, 24), orientation, CENTER, CENTER, RADIUS);
  // The number sits on the bisector, just outside the arc, which is where it
  // stays clear of both legs at every angle including a very tight one.
  const bisector = normalize({ x: toA.x + toB.x, y: toA.y + toB.y, z: toA.z + toB.z });
  const label = project(walk(vertex, bisector, arcToAngle(1.25)), orientation, CENTER, CENTER, RADIUS);

  return (
    <g pointerEvents="none">
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={toPolyline(run)}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity={run.front ? 0.95 : BEHIND}
        />
      ))}
      {label.front && label.facing > 0.3 && (
        <text
          x={label.x}
          y={label.y}
          fill={color}
          fontWeight="700"
          textAnchor="middle"
          opacity={Math.min(1, (label.facing - 0.3) * 4)}
          stroke="#0f172a"
          strokeWidth="2.5"
          strokeLinejoin="round"
          style={{ paintOrder: "stroke" }}
        >
          {/* Two lines rather than "45° VAL" on one, which would be half as
              wide again and put the two labels back into each other. */}
          <tspan x={label.x} fontSize="11">
            {value}
            {"°"}
          </tspan>
          <tspan x={label.x} dy="8" fontSize="6.5" letterSpacing="0.4">
            {name}
          </tspan>
        </text>
      )}
    </g>
  );
}

/**
 * Put a marker's label beside it, on whichever side keeps it inside the drawing.
 *
 * A label always set outward runs off the viewBox the moment its marker reaches
 * the silhouette, which is exactly where the PAP sits at a normal 5 inch
 * measurement. So it starts outward and flips inward at the edge rather than
 * being clipped.
 */
function labelAnchor(x: number, y: number): { x: number; y: number; textAnchor: "start" | "end" } {
  const outward = x >= CENTER;
  const gutter = 36;
  if (outward && x + gutter > SIZE) return { x: x - 11, y: y - 9, textAnchor: "end" };
  if (!outward && x - gutter < 0) return { x: x + 11, y: y - 9, textAnchor: "start" };
  return outward
    ? { x: x + 11, y: y - 9, textAnchor: "start" }
    : { x: x - 11, y: y - 9, textAnchor: "end" };
}

/** Any unit vector perpendicular to `v`, for seeding a circle about it. */
function perpendicularTo(v: Vec3): Vec3 {
  const seed: Vec3 = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return tangentToward(v, seed);
}

/** Screen angle from the ball's centre out to a point, so a hole's squash is
 *  flattened along the radius rather than along the screen's x axis. */
function holeAngle(q: { x: number; y: number }, center: number): number {
  return (Math.atan2(q.y - center, q.x - center) * 180) / Math.PI;
}

/**
 * A conventional grip: thumb on the midline toward the bowler's own side, two
 * finger holes above it. Not measured off the layout, since span and pitch are
 * a hand fitting rather than a layout, but drawn because the VAL angle is
 * meaningless without something to be up or down *of*.
 */
function gripHolePoints(gripCenter: Vec3, hand: Handedness): Array<{ point: Vec3; r: number }> {
  // The finger row leans toward the PAP, which is on the other side of the ball
  // for a left-hander, so the holes mirror with the rest of the layout.
  const towardPap = tangentToward(gripCenter, { x: hand === "left" ? -1 : 1, y: 0, z: 0 });
  const up = tangentToward(gripCenter, { x: 0, y: 1, z: 0 });
  const thumb = walk(gripCenter, up, arcToAngle(-1.7));
  const fingerRow = walk(gripCenter, up, arcToAngle(2.4));
  return [
    { point: thumb, r: 0.075 },
    { point: walk(fingerRow, towardPap, arcToAngle(-0.9)), r: 0.055 },
    { point: walk(fingerRow, towardPap, arcToAngle(0.9)), r: 0.055 }
  ];
}

/** What a screen reader gets, since the picture carries the whole point. */
function describeDiagram(layout: DualAngleLayout, ball: BallSpec): string {
  const marker = ball.symmetric ? "CG" : "PSA";
  return (
    `A bowling ball showing a ${Math.round(layout.drillingAngle)} by ${layout.pinToPap.toFixed(2)} inch by ` +
    `${Math.round(layout.valAngle)} dual angle layout. The pin sits ${layout.pinToPap.toFixed(2)} inches from the PAP ` +
    `with a ${pinBuffer(layout.pinToPap, layout.valAngle).toFixed(2)} inch pin buffer, and the ${marker} is ` +
    `${coreToPap(layout, ball).toFixed(2)} inches from the PAP. Drag the ball, or use the arrow keys, to turn it.`
  );
}
