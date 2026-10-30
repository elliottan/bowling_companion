import { t } from "@lingui/core/macro";

/**
 * The diagrams in the guides, drawn rather than photographed.
 *
 * Inline SVG on the theme tokens, for three reasons a picture file fails: a
 * manufacturer's layout diagram is theirs and not ours to ship, a raster image
 * keeps its white background when the app goes dark, and the app is offline at
 * the alley, where a remote image is a blank box.
 *
 * Every figure is the same ball from the same viewpoint: looking straight down
 * the PAP, with the PAP at the middle of the disc. That viewpoint is what makes
 * the drawing honest rather than convenient. A line drawn on a ball is a circle
 * around it, so it curves away in any other view, and it is only seen edge on,
 * as a straight line, when it passes through the point you are looking at. The
 * midline, the VAL and the pin line all pass through the PAP, so all three are
 * straight here, and the angles between them at the PAP are their true sizes.
 *
 * The distances are not to scale. Five inches from the grip center to the PAP
 * is most of the way to the horizon of a ball this size, which would put the
 * grip on the rim and hide it.
 */

/** Which drawing. The id lives in `lib/guides.ts` beside the article text;
 *  `lib` cannot import a component (docs/ARCHITECTURE.md), so it names the
 *  figure and this file owns the geometry. */
export type GuideFigureId = "ball-points" | "dual-angles" | "pin-buffer";

// One coordinate system for every figure. The ball is centred left of middle
// so the labels have a margin to sit in without a leader line crossing it.
const VIEW_BOX = "0 0 300 236";

const LABEL = "fill-ink-secondary text-caption-2";
const ACCENT_LABEL = "fill-accent text-caption-2 font-semibold";
const PIN_LABEL = "fill-warning-700 text-caption-2 font-semibold";

function Ball() {
  return <circle cx={150} cy={118} r={86} className="fill-surface-muted stroke-edge" strokeWidth={1.5} />;
}

/** The two reference lines every layout is measured against, with the right
 *  angle between them marked: the midline runs through the grip center, and
 *  the VAL crosses it square, through the PAP. */
function References() {
  return (
    <>
      <line x1={58} y1={118} x2={242} y2={118} className="stroke-ink-tertiary" strokeWidth={1.3} strokeDasharray="5 4" />
      <text x={196} y={132} className={LABEL}>
        {t({ message: "Grip midline", comment: "Bowling term: the line through the grip center, running along the ball between the fingers and thumb holes. A label on a ball diagram." })}
      </text>
      <line x1={150} y1={26} x2={150} y2={210} className="stroke-ink-tertiary" strokeWidth={1.3} strokeDasharray="5 4" />
      <text x={156} y={34} className={LABEL}>
        {t({ message: "VAL", comment: "Bowling term: vertical axis line, a reference line across the ball through the PAP, square to the grip midline. Keep the abbreviation. A label on a ball diagram." })}
      </text>
      <path d="M 150 106 L 162 106 L 162 118" fill="none" className="stroke-ink-tertiary" strokeWidth={1} />
    </>
  );
}

/** The holes, and the grip center they are measured from. The two fingers sit
 *  either side of the thumb's line, which is what makes the midline the
 *  midline, and they are drawn as ellipses because a hole that far around the
 *  ball is seen at an angle. */
function GripCenter() {
  return (
    <>
      <circle cx={94} cy={118} r={3} className="fill-ink-secondary" />
      <line x1={104} y1={170} x2={96} y2={124} className="stroke-ink-tertiary" strokeWidth={0.8} />
      <text x={108} y={180} textAnchor="middle" className={LABEL}>
        {t({ message: "Grip center", comment: "Bowling term: the middle point of the grip holes, where layout measurements start. A label on a ball diagram." })}
      </text>
    </>
  );
}

/** The holes themselves, left off the angle figure, where they would sit under
 *  the arcs without adding anything to what the arcs are showing. */
function Holes() {
  return (
    <g className="fill-surface stroke-edge-strong" strokeWidth={1}>
      <ellipse cx={84} cy={94} rx={5} ry={7} />
      <ellipse cx={106} cy={94} rx={5.5} ry={7.5} />
      <ellipse cx={94} cy={148} rx={6} ry={8.5} />
    </g>
  );
}

/** The pin, and the line from it to the PAP at the middle of the view. */
function PinLine() {
  return (
    <>
      <line x1={150} y1={118} x2={104} y2={60} className="stroke-accent" strokeWidth={2} />
      <circle cx={104} cy={60} r={6} className="fill-warning-700" />
      <circle cx={150} cy={118} r={5} className="fill-accent" />
      <text x={158} y={114} className={ACCENT_LABEL}>
        {t({ message: "PAP", comment: "Bowling term: positive axis point, the spot on the ball the axis of rotation runs through. Keep the abbreviation. A label on a ball diagram." })}
      </text>
    </>
  );
}

function BallPoints() {
  return (
    <>
      <Ball />
      <References />
      <Holes />
      <GripCenter />
      <PinLine />
      <text x={124} y={76} className={ACCENT_LABEL}>
        {t({ message: "Pin to PAP", comment: "Bowling term: the distance from the pin to the PAP on the ball. A label on a ball diagram." })}
      </text>
      <text x={104} y={46} textAnchor="middle" className={PIN_LABEL}>
        {t({ message: "Pin", comment: "Bowling term: the pin mark on a ball, the top of the core's weight. Not a bowling pin. A label on a ball diagram." })}
      </text>
    </>
  );
}

function DualAngles() {
  return (
    <>
      <Ball />
      <References />
      <circle cx={94} cy={118} r={3} className="fill-ink-secondary" />
      <text x={94} y={138} textAnchor="middle" className={LABEL}>
        {t({ message: "Grip center", comment: "Bowling term: the middle point of the grip holes, where layout measurements start. A label on a ball diagram." })}
      </text>
      <PinLine />
      <text x={104} y={46} textAnchor="middle" className={PIN_LABEL}>
        {t({ message: "Pin", comment: "Bowling term: the pin mark on a ball, the top of the core's weight. Not a bowling pin. A label on a ball diagram." })}
      </text>
      {/* Both angles are measured at the PAP, so they share a vertex here: the
          drilling angle opens off the midline toward the grip, the VAL angle
          off the VAL, and the pin line is the arm they share. */}
      <path d="M 110 118 A 40 40 0 0 1 125 87" fill="none" className="stroke-warning-700" strokeWidth={1.6} />
      <line x1={98} y1={98} x2={114} y2={105} className="stroke-warning-700" strokeWidth={0.8} />
      {/* One message, broken into lines at its spaces so a translation wraps
          the same way the English does. */}
      {t({ message: "Drilling angle", comment: "Bowling term: the angle from the grip midline to the pin line at the PAP. A label on a ball diagram, wrapped onto lines at its spaces." })
        .split(" ")
        .map((line, i) => (
          <text key={i} x={44} y={90 + 12 * i} className={PIN_LABEL}>
            {line}
          </text>
        ))}
      <path d="M 132 95 A 24 24 0 0 1 150 94" fill="none" className="stroke-accent" strokeWidth={1.6} />
      <line x1={158} y1={82} x2={147} y2={90} className="stroke-accent" strokeWidth={0.8} />
      <text x={160} y={78} className={ACCENT_LABEL}>
        {t({ message: "VAL angle", comment: "Bowling term: the angle from the VAL to the pin line at the PAP. A label on a ball diagram." })}
      </text>
    </>
  );
}

function PinBuffer() {
  return (
    <>
      <Ball />
      <References />
      <Holes />
      <GripCenter />
      {/* The buffer is the square distance across to the VAL, not the distance
          along the pin line, so it is drawn with the right angle showing. */}
      <line x1={104} y1={60} x2={150} y2={60} className="stroke-warning-700" strokeWidth={1.6} strokeDasharray="4 3" />
      <path d="M 140 60 L 140 70 L 150 70" fill="none" className="stroke-warning-700" strokeWidth={1} />
      <text x={156} y={58} className={PIN_LABEL}>
        {t({ message: "Pin buffer", comment: "Bowling term: the distance from the pin to the VAL, across the ball. A label on a ball diagram." })}
      </text>
      <PinLine />
      <text x={122} y={80} className={ACCENT_LABEL}>
        {t({ message: "Pin to PAP", comment: "Bowling term: the distance from the pin to the PAP on the ball. A label on a ball diagram." })}
      </text>
      <text x={92} y={48} textAnchor="middle" className={PIN_LABEL}>
        {t({ message: "Pin", comment: "Bowling term: the pin mark on a ball, the top of the core's weight. Not a bowling pin. A label on a ball diagram." })}
      </text>
    </>
  );
}

const FIGURES: Record<GuideFigureId, () => JSX.Element> = {
  "ball-points": BallPoints,
  "dual-angles": DualAngles,
  "pin-buffer": PinBuffer
};

/**
 * One figure with its caption. The caption is the accessible name as well as
 * the line under the drawing: a reader who cannot see the SVG gets the same
 * sentence a reader who can gets, rather than "image".
 */
export function GuideFigure({ figure, caption }: { figure: GuideFigureId; caption: string }) {
  const Drawing = FIGURES[figure];
  return (
    <figure className="rounded-xl border border-edge bg-surface p-2 shadow-sm">
      <svg viewBox={VIEW_BOX} role="img" aria-label={caption} className="w-full">
        <Drawing />
      </svg>
      <figcaption className="px-1 pb-1 pt-2 text-xs text-ink-secondary">{caption}</figcaption>
    </figure>
  );
}
