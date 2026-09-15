/**
 * Dual Angle layout geometry and the ball-motion reading that falls out of it.
 *
 * The Dual Angle Layout Technique (Mo Pinel) names a layout with three numbers,
 * always written in this order:
 *
 *   drilling angle  x  pin-to-PAP distance  x  VAL angle
 *
 * Each has a precise geometric meaning, and the whole module rests on getting
 * the vertex of each angle right:
 *
 * - **Drilling angle**: vertex at the **pin**. The angle between the line drawn
 *   from the pin through the PAP and the line drawn from the pin through the
 *   CG (symmetric core) or the PSA / mass bias marker (asymmetric core). It
 *   positions the weight block around the pin-to-PAP line, which is why it
 *   moves an asymmetric ball far more than a symmetric one: on a symmetric ball
 *   the only thing it relocates is the static CG.
 * - **Pin-to-PAP distance**: the arc along the ball surface from pin to PAP. It
 *   sets how much of the core's differential the bowler's axis actually gets to
 *   use, so it is the flare control.
 * - **VAL angle**: vertex at the **PAP**. The angle between the pin-to-PAP line
 *   and the Vertical Axis Line, the great circle through the PAP perpendicular
 *   to the PAP-to-grip-centre line. It slides the block up and down relative to
 *   the grip, which is the pin-up / pin-down axis and the transition control.
 *
 * Everything here is spherical geometry on the ball surface, not flat drawing
 * on paper. Distances are arcs in inches; a distance converts to a central
 * angle as `arc / BALL_RADIUS`. Flat trigonometry is close enough for a 1"
 * buffer and visibly wrong by the time a pin-to-PAP distance reaches 5 1/2",
 * which is inside the range a bowler actually uses, so it is never used.
 *
 * Pure, React-free and Dexie-free, per the `lib/` layering rule.
 */

import type { BallLayoutSpec, Handedness, LayoutSystem } from "../types/bowling";

/** A USBC-legal ball is 8.5" across, so every arc on its surface rides this radius. */
export const BALL_RADIUS = 4.25;
/** Full circumference, the number pro shops quote when they talk about arc distance. */
export const BALL_CIRCUMFERENCE = 2 * Math.PI * BALL_RADIUS;
/** A quarter of the way round the ball. A PAP can never sit farther than this from a pin. */
export const MAX_ARC = BALL_CIRCUMFERENCE / 2;

const DEG = Math.PI / 180;

const toRad = (deg: number) => deg * DEG;
const toDeg = (rad: number) => rad / DEG;

/** Arc length in inches along the surface to the central angle it subtends. */
export const arcToAngle = (inches: number) => inches / BALL_RADIUS;
/** Central angle back to the arc length in inches. */
export const angleToArc = (rad: number) => rad * BALL_RADIUS;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Vector helpers. Points on the ball are unit vectors; tangents are unit
// vectors orthogonal to them. Nothing here is general-purpose enough to earn
// its own module.
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
const length = (a: Vec3) => Math.sqrt(dot(a, a));

/** Normalise, falling back to the +z pole rather than returning NaN on a zero vector. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return scale(a, 1 / len);
}

/**
 * Walk `angle` radians from the point `from` along the great circle heading in
 * tangent direction `dir`. The one primitive every layout point is built from.
 */
export function walk(from: Vec3, dir: Vec3, angle: number): Vec3 {
  return normalize(add(scale(from, Math.cos(angle)), scale(dir, Math.sin(angle))));
}

/** The unit tangent at `from` pointing along the great circle toward `to`. */
export function tangentToward(from: Vec3, to: Vec3): Vec3 {
  const projected = add(to, scale(from, -dot(from, to)));
  return normalize(projected);
}

/** Great-circle arc between two surface points, in inches. */
export function surfaceDistance(a: Vec3, b: Vec3): number {
  return angleToArc(Math.acos(clamp(dot(a, b), -1, 1)));
}

// ---------------------------------------------------------------------------
// The layout itself
// ---------------------------------------------------------------------------

export interface DualAngleLayout {
  /** Degrees, vertex at the pin, between pin-to-PAP and pin-to-CG/PSA. */
  drillingAngle: number;
  /** Surface arc from pin to PAP, in inches. */
  pinToPap: number;
  /** Degrees, vertex at the PAP, between pin-to-PAP and the VAL. */
  valAngle: number;
}

/**
 * Where the bowler's axis sits, measured from the centre of grip the way a pro
 * shop writes it on a drill sheet: so many inches across, so many up or down.
 * A negative `up` is a PAP below the midline, which is a real and common
 * measurement rather than an error.
 */
export interface PapMeasurement {
  /** Inches across the midline from the centre of grip, away from the thumb side. */
  over: number;
  /** Inches above (positive) or below (negative) the midline. */
  up: number;
}

export const DEFAULT_PAP: PapMeasurement = { over: 5, up: 0.5 };

/**
 * The ball being laid out. `pinToCore` is the ball's own fixed geometry, not
 * part of the layout: the arc from the pin to the marker the drilling angle is
 * measured to. On an asymmetric ball that marker is the PSA and the distance is
 * set by the core, commonly 6 3/4"; on a symmetric ball it is the CG, which the
 * factory places wherever static balance lands, typically within a few inches.
 */
export interface BallSpec {
  symmetric: boolean;
  /** Arc, inches, pin to PSA (asymmetric) or pin to CG (symmetric). */
  pinToCore: number;
  /** Total differential. Scales how much flare the layout can actually produce. */
  diff: number;
  /** Intermediate differential. Zero, and ignored, on a symmetric ball. */
  mbDiff: number;
}

export const DEFAULT_ASYMMETRIC: BallSpec = { symmetric: false, pinToCore: 6.75, diff: 0.05, mbDiff: 0.018 };
export const DEFAULT_SYMMETRIC: BallSpec = { symmetric: true, pinToCore: 3, diff: 0.045, mbDiff: 0 };

/**
 * Every landmark of a laid-out ball, as unit vectors on the sphere, in a frame
 * chosen so the drawing code never has to think about it:
 *
 *   +z is the centre of grip, facing the viewer.
 *   +x is the direction the PAP lies from the grip along the midline.
 *   +y is up.
 *
 * So the midline is the z-x great circle and a layout is drawn by projecting
 * these points straight down the z axis.
 */
export interface LayoutGeometry {
  gripCenter: Vec3;
  pap: Vec3;
  /** Antipode of the PAP. The axis runs through the ball, so the drawing has two ends. */
  papNegative: Vec3;
  pin: Vec3;
  /** CG on a symmetric ball, PSA / mass bias on an asymmetric one. */
  core: Vec3;
  /** Unit tangent at the PAP along the VAL, pointing to the pin-up side. */
  valDirection: Vec3;
  /** Unit tangent at the PAP along the midline, pointing at the grip centre. */
  gripDirection: Vec3;
  /**
   * Where the shortest arc from the pin meets the VAL: the foot of the pin
   * buffer. It is not a layout input, it is where the second number of a Storm
   * VLS layout is measured to, so the drawing needs it to put that measurement
   * on the ball rather than only in a readout.
   */
  valFoot: Vec3;
}

/**
 * Build the frame and place the PAP in it. The PAP measurement is a pair of
 * arcs walked in sequence, across then up, which is exactly how it is measured
 * on a ball with a flexible tape.
 */
export function papVector(pap: PapMeasurement): Vec3 {
  const grip: Vec3 = { x: 0, y: 0, z: 1 };
  const across = walk(grip, { x: 1, y: 0, z: 0 }, arcToAngle(pap.over));
  const upDir = tangentToward(across, { x: 0, y: 1, z: 0 });
  return walk(across, upDir, arcToAngle(pap.up));
}

/**
 * Place every landmark for a layout.
 *
 * The two angles are applied at their own vertices, and the direction each one
 * opens toward is the convention this module fixes:
 *
 * - The VAL angle opens at the PAP from the VAL's pin-up side, rotating toward
 *   the grip centre. So 0 degrees puts the pin straight up the VAL, as high
 *   above the fingers as the distance allows, and 90 degrees lays the pin flat
 *   on the PAP-to-grip line, the deepest pin-down the system can describe.
 *   That is the pin-up-to-pin-down sweep the dual angle chart labels.
 * - The drilling angle opens at the pin from the pin-to-PAP line, rotating away
 *   from the VAL's pin-up side, so the core marker swings down and out as the
 *   angle grows. At 0 degrees the marker sits on the pin-to-PAP line itself,
 *   the closest to the axis it can get and so the earliest roll.
 */
export function layoutGeometry(
  layout: DualAngleLayout,
  ball: BallSpec,
  pap: PapMeasurement = DEFAULT_PAP,
  hand: Handedness = "right"
): LayoutGeometry {
  const gripCenter: Vec3 = { x: 0, y: 0, z: 1 };
  const papPoint = papVector(pap);

  const gripDirection = tangentToward(papPoint, gripCenter);
  // The VAL is perpendicular to the PAP-to-grip line at the PAP. Of its two
  // tangent directions we keep the one pointing up, which is the pin-up side.
  const valDirection = normalize(cross(gripDirection, papPoint));

  const valRad = toRad(clamp(layout.valAngle, 0, 90));
  const pinDirection = normalize(
    add(scale(valDirection, Math.cos(valRad)), scale(gripDirection, Math.sin(valRad)))
  );
  const pin = walk(papPoint, pinDirection, arcToAngle(clamp(layout.pinToPap, 0, MAX_ARC)));

  const toPap = tangentToward(pin, papPoint);
  // Perpendicular at the pin, pointing to the side the core marker swings onto.
  const away = normalize(cross(toPap, pin));
  const drillRad = toRad(clamp(layout.drillingAngle, 0, 90));
  const coreDirection = normalize(add(scale(toPap, Math.cos(drillRad)), scale(away, Math.sin(drillRad))));
  const core = walk(pin, coreDirection, arcToAngle(clamp(ball.pinToCore, 0, MAX_ARC)));

  // A left-handed layout is the right-handed one seen in a mirror. Negating x
  // reflects the whole construction through the plane of the grip, which leaves
  // every arc length and every angle exactly as it was and swings the pin, the
  // core and the axis to the other side of the ball. Mirroring at the end
  // rather than threading a sign through each step is what keeps that true by
  // construction: there is only one place the handedness can be got wrong.
  const flip = hand === "left" ? mirrorX : (v: Vec3) => v;

  // The VAL is the great circle through the PAP with tangent `valDirection`, so
  // its pole is the one axis both are perpendicular to. Dropping the pin onto
  // that plane and renormalising is the foot of the perpendicular, which is the
  // nearest point of the VAL to the pin and therefore the end of the buffer.
  const valPole = normalize(cross(papPoint, valDirection));
  const valFoot = normalize(add(pin, scale(valPole, -dot(pin, valPole))));

  return {
    gripCenter,
    pap: flip(papPoint),
    papNegative: flip(scale(papPoint, -1)),
    pin: flip(pin),
    core: flip(core),
    valDirection: flip(valDirection),
    gripDirection: flip(gripDirection),
    valFoot: flip(valFoot)
  };
}

/** Reflection through the plane x = 0, which is the grip's own vertical plane. */
const mirrorX = (v: Vec3): Vec3 => ({ x: -v.x, y: v.y, z: v.z });

// ---------------------------------------------------------------------------
// Derived distances: the numbers a pro shop measures back off a drilled ball,
// and the ones the Storm VLS system is written in.
// ---------------------------------------------------------------------------

/**
 * Pin buffer, also called the pin-to-VAL distance: the shortest arc from the
 * pin to the Vertical Axis Line.
 *
 * On the sphere this is the right-triangle identity
 * `sin(buffer / R) = sin(pinToPap / R) * sin(valAngle)`.
 *
 * The rule of thumb pro shops quote is the flat version of the same triangle,
 * `buffer = pinToPap * sin(valAngle)`, which is where the familiar worked
 * example comes from: a 2 1/2" buffer on a 5" pin-to-PAP read as a 30 degree
 * VAL angle. That example is off. Both the angle and the distances are measured
 * on the ball's surface, so the triangle is spherical, and 5" is nearly a fifth
 * of the way round an 8.5" ball. The true VAL angle there is 37 degrees, and a
 * real 30 degree VAL angle gives a 2 1/16" buffer. The flat rule is fine inside
 * an inch or two and wrong by a quarter inch, the unit the buffer is quoted in,
 * across the range bowlers actually drill. So it is not used here.
 */
export function pinBuffer(pinToPap: number, valAngle: number): number {
  const a = arcToAngle(clamp(pinToPap, 0, MAX_ARC));
  const v = toRad(clamp(valAngle, 0, 90));
  return angleToArc(Math.asin(clamp(Math.sin(a) * Math.sin(v), -1, 1)));
}

/** Inverse of `pinBuffer`: the VAL angle that produces a wanted buffer. */
export function valAngleForBuffer(pinToPap: number, buffer: number): number {
  const a = Math.sin(arcToAngle(clamp(pinToPap, 0, MAX_ARC)));
  if (a < 1e-9) return 0;
  const b = Math.sin(arcToAngle(clamp(buffer, 0, MAX_ARC)));
  return toDeg(Math.asin(clamp(b / a, -1, 1)));
}

/**
 * Arc from the core marker (PSA or CG) to the PAP, by the spherical law of
 * cosines on the triangle with its vertex at the pin. This is the second number
 * in a Storm VLS layout, and on an asymmetric ball it is what governs how fast
 * the ball sheds axis rotation.
 */
export function coreToPap(layout: DualAngleLayout, ball: BallSpec): number {
  const a = arcToAngle(clamp(layout.pinToPap, 0, MAX_ARC));
  const b = arcToAngle(clamp(ball.pinToCore, 0, MAX_ARC));
  const c = toRad(clamp(layout.drillingAngle, 0, 90));
  return angleToArc(
    Math.acos(clamp(Math.cos(a) * Math.cos(b) + Math.sin(a) * Math.sin(b) * Math.cos(c), -1, 1))
  );
}

/** Inverse of `coreToPap`: the drilling angle that puts the core marker at a wanted distance. */
export function drillingAngleForCoreToPap(pinToPap: number, coreDistance: number, ball: BallSpec): number {
  const a = arcToAngle(clamp(pinToPap, 0, MAX_ARC));
  const b = arcToAngle(clamp(ball.pinToCore, 0, MAX_ARC));
  const denom = Math.sin(a) * Math.sin(b);
  if (Math.abs(denom) < 1e-9) return 0;
  const target = arcToAngle(clamp(coreDistance, 0, MAX_ARC));
  return toDeg(Math.acos(clamp((Math.cos(target) - Math.cos(a) * Math.cos(b)) / denom, -1, 1)));
}

// ---------------------------------------------------------------------------
// Storm VLS (Vector Layout System)
// ---------------------------------------------------------------------------

/**
 * A Storm VLS layout, written `pin-to-PAP x PSA-to-PAP x pin buffer`, all three
 * in inches. Storm's own framing is that VLS says the same thing the dual angle
 * system says but in distances rather than angles, and takes the core's own
 * geometry into account by naming the PSA distance outright instead of leaving
 * it implied by the drilling angle.
 *
 * The middle number is meaningless on a symmetric ball, which has no preferred
 * spin axis to measure to, so it is null there and such a layout is quoted as
 * two numbers.
 */
export interface VlsLayout {
  pinToPap: number;
  psaToPap: number | null;
  pinBuffer: number;
}

/**
 * Dual angle to VLS. Exact, not an estimate: the two systems describe the same
 * three degrees of freedom, so the conversion is the geometry above read back
 * out as distances. It does depend on the ball's own pin-to-PSA distance, which
 * is why the same dual angle numbers on two different asymmetric balls are two
 * different VLS layouts.
 */
export function toVls(layout: DualAngleLayout, ball: BallSpec): VlsLayout {
  return {
    pinToPap: clamp(layout.pinToPap, 0, MAX_ARC),
    psaToPap: ball.symmetric ? null : coreToPap(layout, ball),
    pinBuffer: pinBuffer(layout.pinToPap, layout.valAngle)
  };
}

/**
 * VLS back to dual angle. The inverse of `toVls` wherever the VLS numbers
 * describe a triangle that closes; where they do not, the angles clamp and
 * `exact` is false, which the UI shows rather than silently rounding away.
 */
export function fromVls(vls: VlsLayout, ball: BallSpec): DualAngleLayout & { exact: boolean } {
  const pinToPap = clamp(vls.pinToPap, 0, MAX_ARC);
  const maxBuffer = pinToPap;
  const requestedBuffer = clamp(vls.pinBuffer, 0, MAX_ARC);
  const valAngle = valAngleForBuffer(pinToPap, Math.min(requestedBuffer, maxBuffer));

  const drillingAngle =
    ball.symmetric || vls.psaToPap == null
      ? 45
      : drillingAngleForCoreToPap(pinToPap, vls.psaToPap, ball);

  const reachable = requestedBuffer <= maxBuffer + 1e-9;
  const round = toVls({ drillingAngle, pinToPap, valAngle }, ball);
  const exact =
    reachable &&
    Math.abs(round.pinBuffer - requestedBuffer) < 0.02 &&
    (round.psaToPap == null || vls.psaToPap == null || Math.abs(round.psaToPap - vls.psaToPap) < 0.02);

  return { drillingAngle, pinToPap, valAngle, exact };
}

/** `5" x 4" x 2 1/2"`, in the quarter-inch fractions pro shops actually write. */
export function formatVls(vls: VlsLayout): string {
  const parts = [vls.pinToPap, ...(vls.psaToPap == null ? [] : [vls.psaToPap]), vls.pinBuffer];
  return parts.map(formatInches).join(" x ");
}

/** `45 x 4 1/2 x 35`, the dual angle written the way a drill sheet writes it. */
export function formatDualAngle(layout: DualAngleLayout): string {
  return `${Math.round(layout.drillingAngle)} x ${formatInches(layout.pinToPap)} x ${Math.round(layout.valAngle)}`;
}

/**
 * The eighths, by numerator. Index 0 is the whole inch, written "0" rather than
 * left blank: it is an option in a list of fractions, and an empty row reads as
 * a box that failed to fill in rather than as no eighths at all. Nothing
 * formats through index 0, because `formatInches` returns the whole inches
 * before it reaches here.
 */
export const EIGHTHS = ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"] as const;

/** Inches to the nearest eighth, written as a mixed fraction. */
export function formatInches(value: number): string {
  const eighths = Math.round(clamp(value, 0, MAX_ARC) * 8);
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (rest === 0) return `${whole}`;
  if (whole === 0) return EIGHTHS[rest];
  return `${whole} ${EIGHTHS[rest]}`;
}

/**
 * A written measurement, split into the parts that are set at different sizes.
 *
 * `4 1/2"` is one number, but the fraction in it is a stack of two digits
 * squeezed into the height of one, so at a single weight it reads as noise
 * beside the whole inches and the eye has to stop and parse it. Setting the
 * fraction a step smaller is what typesetting has always done with one, and it
 * is what makes `4 1/2` read as four and a half at a glance rather than as
 * three characters.
 *
 * The split is here rather than in the component that draws it because it is a
 * string rule with edge cases worth testing: a bare fraction with no whole part
 * (`1/2"`), a separator (`x`) between measurements, and a number that has no
 * fraction at all and must come back as one part rather than as an empty one.
 *
 * A fractional run carries any inch mark that follows it, so `1/2"` shrinks
 * whole rather than leaving a full-size quote hanging off a small fraction.
 */
export interface MeasureRun {
  text: string;
  /** True where this run is a fraction and should be set smaller. */
  fraction: boolean;
}

const FRACTION_RUN = /\d+\/\d+"?/g;

export function splitFractionRuns(text: string): MeasureRun[] {
  const runs: MeasureRun[] = [];
  let at = 0;
  for (const match of text.matchAll(FRACTION_RUN)) {
    const start = match.index;
    if (start > at) runs.push({ text: text.slice(at, start), fraction: false });
    runs.push({ text: match[0], fraction: true });
    at = start + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), fraction: false });
  return runs;
}

/**
 * A measurement as it is written and typed: whole inches, eighths, and which
 * way it goes.
 *
 * Nothing in bowling is measured in decimal inches. A pro shop writes a PAP as
 * "5 over and 1/2 up", a tape reads in sixteenths, and a drill sheet never
 * carries a decimal point. So a measurement is entered as the two parts it is
 * spoken in, and this pair of functions is the only place the decimal the math
 * needs and the fraction a bowler reads meet.
 *
 * `negative` rather than a signed whole number because the sign belongs to the
 * whole measurement, not to its integer part: half an inch below the midline is
 * a real PAP and there is no way to write it as a negative zero.
 */
export interface InchParts {
  whole: number;
  /** Numerator over eight, 0 to 7. */
  eighths: number;
  negative: boolean;
}

export function splitInches(value: number): InchParts {
  const total = Math.round(Math.abs(value) * 8);
  return { whole: Math.floor(total / 8), eighths: total % 8, negative: value < 0 };
}

export function joinInches({ whole, eighths, negative }: InchParts): number {
  const magnitude = Math.abs(whole) + Math.abs(eighths) / 8;
  return negative ? -magnitude : magnitude;
}

// ---------------------------------------------------------------------------
// Ball motion
// ---------------------------------------------------------------------------

/**
 * The flare-potential curve against pin-to-PAP distance.
 *
 * Track flare comes from the core migrating, and it can only migrate if the
 * bowler's axis is somewhere between the core's two stable spin axes. Put the
 * PAP on the pin (0") and there is nothing to migrate; put it a quarter of the
 * way round the ball from the pin (6 3/4", on the ball's own axis line) and it
 * is stable again, so flare falls back to nothing. Between them it peaks, and
 * it peaks nearer the middle-to-high end, around 3 3/8", which is why the dual
 * angle chart calls 3 3/8" to 4 1/2" the high flare band.
 *
 * Modelled as a half sine over the 0" to 6 3/4" span, skewed by `FLARE_SKEW` so
 * the peak lands at 3.9" rather than at the midpoint. A plain symmetric hump
 * peaks at 3.34", a whisker below the chart's high flare band; the skew puts
 * the peak inside it and, more usefully, reproduces the rest of the chart's
 * bands too: 3/4" to 2 1/4" comes out low, 3 3/8" to 4 1/2" comes out highest,
 * and 4 1/2" to 5 1/2" falls back off.
 *
 * The curve is the shape; the ball's differential is the scale, normalised so
 * that a typical 0.055 differential at the peak reads as 1.
 */
export const REFERENCE_DIFF = 0.055;
/** Pin-to-PAP distance at which the pin reaches the bowler's own axis line. */
export const AXIS_ARC = 6.75;
const FLARE_SKEW = 1.264;

export function flarePotential(pinToPap: number, diff: number): number {
  const t = clamp(pinToPap, 0, AXIS_ARC) / AXIS_ARC;
  const shape = clamp(Math.sin(Math.PI * Math.pow(t, FLARE_SKEW)), 0, 1);
  return (shape * clamp(diff, 0, 0.08)) / REFERENCE_DIFF;
}

/**
 * The pin-to-PAP band the dual angle chart marks "do not use", 2 3/8" to 3 3/8".
 *
 * It is not a motion judgement. A pin-to-PAP distance in this band puts the
 * peak of the flare rings right where the thumb hole is on most grips, so the
 * track runs over the hole and the ball reads the lane differently on the shots
 * where it catches the edge than the ones where it does not. The reaction is
 * fine on average and unrepeatable in practice, so the system routes around it.
 */
export const DO_NOT_USE_BAND: readonly [number, number] = [2.375, 3.375];

export const inDoNotUseBand = (pinToPap: number) =>
  pinToPap > DO_NOT_USE_BAND[0] && pinToPap < DO_NOT_USE_BAND[1];

export interface MotionReading {
  /** 0 = as little flare as the layout can make, 1 = the ball's full differential. */
  flare: number;
  /** Inches of track flare the layout should produce, the number a bowler measures. */
  flareInches: number;
  /** *When* the ball changes direction. 0 = reads the front, 1 = saves it for the back. */
  length: number;
  /**
   * *How hard* it changes direction once it reaches friction, which is a
   * separate question from when. 0 = smooth arc, 1 = sharp corner.
   *
   * The two really are independent, and the dual angle chart says so: it labels
   * the small end of the VAL axis "sharper and earlier motion on friction", one
   * phrase covering both. So an early-roll layout can read the front early and
   * still turn hard when it gets there. Nothing here folds one axis into the
   * other, because the source does not.
   */
  angularity: number;
  /** 0 = weakest this ball gets, 1 = strongest. */
  strength: number;
  /** Plain-language reading, one clause per axis. */
  summary: string;
  /** Anything about the layout the bowler should know before drilling it. */
  warnings: string[];
}

/**
 * Read the layout as ball motion.
 *
 * The three axes are not independent in reality and the model does not pretend
 * they are, but each number has a dominant effect and that is what is encoded:
 *
 * - **Pin-to-PAP** owns flare, on the curve above, and flare is most of
 *   overall strength.
 * - **VAL angle** owns the transition. A small VAL angle puts the pin high
 *   above the grip, the ball revs up soonest and changes direction hardest at
 *   the friction, so it is sharp and early. A large VAL angle lays the pin
 *   down, the ball revs slower and the breakpoint smooths out and moves later.
 * - **Drilling angle** owns how early the core reaches a stable roll, by way of
 *   where it puts the PSA relative to the axis. A small angle sits the PSA
 *   close to the pin-to-PAP line, axis rotation dies fast, the ball rolls
 *   early. A large angle holds the PSA away and the roll comes late. On a
 *   symmetric ball the marker is only the CG, so the same swing of the dial
 *   moves far less, which is exactly the note the dual angle chart carries.
 */
export function readMotion(
  layout: DualAngleLayout,
  ball: BallSpec,
  pap: PapMeasurement = DEFAULT_PAP
): MotionReading {
  const flare = clamp(flarePotential(layout.pinToPap, ball.diff), 0, 1.4);
  const flareInches = clamp(flare, 0, 1.4) * 6.5;

  const val = clamp(layout.valAngle, 0, 90) / 90;
  const drill = clamp(layout.drillingAngle, 0, 90) / 90;

  // How much authority the drilling angle has. An asymmetric core swings its
  // PSA a long way for the same angle; a symmetric one is mostly along for the
  // ride, so its drilling angle is damped hard rather than ignored.
  const drillWeight = ball.symmetric ? 0.25 : 1;

  const length = clamp(0.5 + (val - 0.5) * 0.55 + (drill - 0.5) * 0.55 * drillWeight, 0, 1);
  const angularity = clamp(0.5 + (0.5 - val) * 0.9 + (drill - 0.5) * 0.3 * drillWeight, 0, 1);
  const strength = clamp(flare * 0.7 + (1 - Math.abs(val - 0.35)) * 0.3, 0, 1);

  const warnings: string[] = [];
  if (inDoNotUseBand(layout.pinToPap)) {
    warnings.push(
      `A pin-to-PAP distance between ${formatInches(DO_NOT_USE_BAND[0])}" and ${formatInches(DO_NOT_USE_BAND[1])}" runs the track over the thumb hole. The reaction is hard to repeat, so the dual angle system skips this band.`
    );
  }
  if (pinBuffer(layout.pinToPap, layout.valAngle) < 0.75 && layout.pinToPap > 0.5) {
    warnings.push(
      "The pin buffer is under 3/4\". The pin sits almost on the axis line, which leaves the driller no room to move the layout and tends to make the ball read flat."
    );
  }
  if (ball.symmetric && (layout.drillingAngle < 20 || layout.drillingAngle > 70)) {
    warnings.push(
      "This is a symmetric ball, so the drilling angle only moves the CG. Expect a much smaller change than the same swing on an asymmetric core."
    );
  }
  if (layout.pinToPap > 5.5) {
    warnings.push(
      "Past 5 1/2\" the pin is closing on the bowler's axis line and flare drops away fast. Check the ball still has enough motion left to be worth drilling."
    );
  }
  if (Math.hypot(pap.over, pap.up) > 6.75) {
    warnings.push("That PAP measurement is farther than a quarter of the way round the ball, which is not a reachable axis.");
  }

  return {
    flare,
    flareInches,
    length,
    angularity,
    strength,
    summary: describeMotion({ flare, length, angularity, strength }),
    warnings
  };
}

const band = (v: number, low: string, mid: string, high: string) => (v < 0.36 ? low : v > 0.64 ? high : mid);

/** One sentence, three clauses, in the order a bowler watches the shot happen. */
export function describeMotion(m: Pick<MotionReading, "flare" | "length" | "angularity" | "strength">): string {
  const lengthWord = band(m.length, "reads the lane early", "picks up in the mid lane", "saves its energy for the back");
  const shapeWord = band(m.angularity, "arcs smoothly through the breakpoint", "turns the corner with a defined shape", "snaps hard off the friction");
  const flareWord = band(m.flare, "low flare", "medium flare", "high flare");
  const strengthWord = band(m.strength, "a weaker", "a controllable", "a strong");
  return `${capitalize(lengthWord)} and ${shapeWord}. ${capitalize(flareWord)}, ${strengthWord} look overall.`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Presets, straight off the dual angle chart
// ---------------------------------------------------------------------------

export interface LayoutPreset {
  id: string;
  name: string;
  /** Layout for a symmetric ball. */
  symmetric: DualAngleLayout;
  /** Layout for an asymmetric ball, which is not always the same numbers. */
  asymmetric: DualAngleLayout;
  blurb: string;
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: "benchmark",
    name: "Benchmark",
    symmetric: { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 },
    asymmetric: { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 },
    blurb: "The middle of every range. Drill this first on a new ball and move from what it shows you."
  },
  {
    id: "early-roll",
    name: "Early roll",
    symmetric: { drillingAngle: 35, pinToPap: 4, valAngle: 35 },
    asymmetric: { drillingAngle: 35, pinToPap: 4, valAngle: 35 },
    blurb: "Everything a touch smaller. Reads the front sooner for heavier oil or a later-rolling hand."
  },
  {
    id: "late-angular",
    name: "Late and angular",
    symmetric: { drillingAngle: 70, pinToPap: 5.25, valAngle: 30 },
    asymmetric: { drillingAngle: 70, pinToPap: 5, valAngle: 30 },
    blurb: "Long drilling angle for length, short VAL angle for a hard corner. Down-and-in on a wall."
  },
  {
    id: "pin-down",
    name: "Pin down",
    symmetric: { drillingAngle: 70, pinToPap: 4.5, valAngle: 70 },
    asymmetric: { drillingAngle: 70, pinToPap: 4.5, valAngle: 70 },
    blurb: "The smoothest shape the chart describes. Controls the breakpoint when the back ends are too clean."
  },
  {
    id: "short-pin",
    name: "Short pin",
    symmetric: { drillingAngle: 45, pinToPap: 2, valAngle: 70 },
    asymmetric: { drillingAngle: 30, pinToPap: 2, valAngle: 70 },
    blurb: "Low flare on purpose. Burns less board on the way down for fresh oil or a spare-adjacent ball."
  }
] as const;

/** Pull the right half of a preset for the ball in hand. */
export const presetLayout = (preset: LayoutPreset, ball: BallSpec): DualAngleLayout =>
  ball.symmetric ? preset.symmetric : preset.asymmetric;

// ---------------------------------------------------------------------------
// A layout as a ball keeps it
// ---------------------------------------------------------------------------

/**
 * The stored form of a layout and the working form are not the same shape, and
 * these four functions are the only place they meet.
 *
 * A ball stores the dual angle three plus its own core geometry (`BallLayoutSpec`
 * in `types/bowling.ts`). The screens work in a `DualAngleLayout` and a
 * `BallSpec`, because that is what every function above takes. The differential
 * numbers a `BallSpec` also carries are not stored on the ball: they scale the
 * motion reading, not the geometry, and the ones worth having come from the
 * catalog entry the ball is linked to rather than from a slider.
 */
export function specToLayout(spec: BallLayoutSpec): DualAngleLayout {
  return {
    drillingAngle: spec.drillingAngle,
    pinToPap: spec.pinToPap,
    valAngle: spec.valAngle
  };
}

/** The ball a stored layout was drilled on, with the default differentials for
 *  its core type where the ball itself has nothing better to say. */
export function specToBall(spec: BallLayoutSpec): BallSpec {
  const base = spec.symmetric ? DEFAULT_SYMMETRIC : DEFAULT_ASYMMETRIC;
  return { ...base, pinToCore: spec.pinToCore };
}

export function makeLayoutSpec(
  layout: DualAngleLayout,
  ball: BallSpec,
  system?: LayoutSystem
): BallLayoutSpec {
  return {
    drillingAngle: layout.drillingAngle,
    pinToPap: layout.pinToPap,
    valAngle: layout.valAngle,
    symmetric: ball.symmetric,
    pinToCore: ball.pinToCore,
    ...(system ? { system } : {})
  };
}

/** A stored layout written in one notation or the other. */
export function formatLayoutSpec(spec: BallLayoutSpec, system: LayoutSystem): string {
  return system === "vls"
    ? formatVls(toVls(specToLayout(spec), specToBall(spec)))
    : formatDualAngle(specToLayout(spec));
}

/** What a stored layout is read in: its own choice, else the app-wide one. */
export const layoutSystemFor = (
  spec: BallLayoutSpec | undefined,
  preference: LayoutSystem
): LayoutSystem => spec?.system ?? preference;
