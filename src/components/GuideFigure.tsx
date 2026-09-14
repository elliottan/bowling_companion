/**
 * The diagrams in the guides, drawn rather than photographed.
 *
 * Inline SVG on the theme tokens, for three reasons a picture file fails: a
 * manufacturer's layout diagram is theirs and not ours to ship, a raster image
 * keeps its white background when the app goes dark, and the app is offline at
 * the alley, where a remote image is a blank box.
 *
 * Every figure is the same ball seen from the same side, so the grip, the PAP
 * and the VAL sit in the same place across all four and a reader moving
 * between guides is looking at one object, not four drawings.
 */

/** Which drawing. The id lives in `lib/guides.ts` beside the article text;
 *  `lib` cannot import a component (docs/ARCHITECTURE.md), so it names the
 *  figure and this file owns the geometry. */
export type GuideFigureId = "ball-points" | "dual-angles" | "flare-rings" | "pin-buffer";

// One coordinate system for every figure. The ball is centred left of middle
// so the labels have a margin to sit in without a leader line crossing it.
const VIEW_BOX = "0 0 300 236";

const LABEL = "fill-ink-secondary text-[10px]";
const ACCENT_LABEL = "fill-accent text-[10px] font-semibold";
const PIN_LABEL = "fill-warning-700 text-[10px] font-semibold";

/** The ball itself, and the grip, shared by the figures that show them. */
function Ball({ cx = 150 }: { cx?: number }) {
  return <circle cx={cx} cy={118} r={86} className="fill-surface-muted stroke-edge" strokeWidth={1.5} />;
}

function Grip() {
  return (
    <g className="fill-surface stroke-edge-strong" strokeWidth={1}>
      <circle cx={110} cy={88} r={7} />
      <circle cx={136} cy={82} r={7} />
      <circle cx={112} cy={152} r={9} />
    </g>
  );
}

function BallPoints() {
  return (
    <>
      <Ball />
      <Grip />
      <circle cx={118} cy={118} r={3} className="fill-ink-secondary" />
      <text x={118} y={136} textAnchor="middle" className={LABEL}>
        Grip center
      </text>
      {/* The VAL runs through the PAP at a right angle to the grip line, which
          is the one relationship the whole page rests on, so the corner is
          marked rather than left to the eye. */}
      <line x1={204} y1={36} x2={204} y2={200} className="stroke-ink-tertiary" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={212} y={52} className={LABEL}>
        VAL
      </text>
      <line x1={118} y1={118} x2={204} y2={118} className="stroke-ink-tertiary" strokeWidth={1} strokeDasharray="2 3" />
      <path d="M 192 118 L 192 106 L 204 106" fill="none" className="stroke-ink-tertiary" strokeWidth={1} />
      <line x1={204} y1={118} x2={156} y2={62} className="stroke-accent" strokeWidth={2} />
      <text x={172} y={88} textAnchor="end" className={ACCENT_LABEL}>
        Pin to PAP
      </text>
      <circle cx={204} cy={118} r={5} className="fill-accent" />
      <text x={212} y={122} className={ACCENT_LABEL}>
        PAP
      </text>
      <circle cx={156} cy={62} r={6} className="fill-warning-700" />
      <text x={150} y={50} textAnchor="middle" className={PIN_LABEL}>
        Pin
      </text>
    </>
  );
}

function DualAngles() {
  return (
    <>
      <Ball />
      <circle cx={118} cy={118} r={3} className="fill-ink-secondary" />
      <text x={118} y={136} textAnchor="middle" className={LABEL}>
        Grip center
      </text>
      <line x1={204} y1={36} x2={204} y2={200} className="stroke-ink-tertiary" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={212} y={52} className={LABEL}>
        VAL
      </text>
      <line x1={118} y1={118} x2={204} y2={118} className="stroke-ink-tertiary" strokeWidth={1} strokeDasharray="2 3" />
      <line x1={204} y1={118} x2={156} y2={62} className="stroke-accent" strokeWidth={2} />
      <circle cx={204} cy={118} r={5} className="fill-accent" />
      <circle cx={156} cy={62} r={6} className="fill-warning-700" />
      <text x={150} y={50} textAnchor="middle" className={PIN_LABEL}>
        Pin
      </text>
      {/* Both angles are measured at the PAP, which is why they share a vertex
          here: the drilling angle opens off the grip line, the VAL angle off
          the VAL, and the pin line is the arm they share. */}
      <path d="M 164 118 A 40 40 0 0 1 178 88" fill="none" className="stroke-warning-700" strokeWidth={1.6} />
      <line x1={172} y1={150} x2={176} y2={126} className="stroke-warning-700" strokeWidth={0.8} />
      <text x={150} y={162} className={PIN_LABEL}>
        Drilling angle
      </text>
      <path d="M 188 100 A 24 24 0 0 1 204 94" fill="none" className="stroke-accent" strokeWidth={1.6} />
      <text x={214} y={84} className={ACCENT_LABEL}>
        VAL angle
      </text>
    </>
  );
}

function FlareRings() {
  // Clipped to the ball: a track ring is oil picked up off the lane, so it
  // cannot run outside the surface that touched it.
  return (
    <>
      <defs>
        <clipPath id="guide-fig-ball">
          <circle cx={140} cy={118} r={85} />
        </clipPath>
      </defs>
      <Ball cx={140} />
      <g fill="none" className="stroke-accent" strokeWidth={1.6} clipPath="url(#guide-fig-ball)">
        <circle cx={112} cy={98} r={66} />
        <circle cx={122} cy={106} r={66} />
        <circle cx={132} cy={114} r={66} />
        <circle cx={142} cy={122} r={66} />
        <circle cx={152} cy={130} r={66} />
        <circle cx={162} cy={138} r={66} />
      </g>
      <line x1={186} y1={60} x2={212} y2={44} className="stroke-ink-tertiary" strokeWidth={0.8} />
      <text x={216} y={42} className={LABEL}>
        One ring,
      </text>
      <text x={216} y={54} className={LABEL}>
        one revolution
      </text>
      <line x1={196} y1={162} x2={214} y2={180} className="stroke-ink-tertiary" strokeWidth={0.8} />
      <text x={218} y={184} className={LABEL}>
        Flare is how far
      </text>
      <text x={218} y={196} className={LABEL}>
        they spread
      </text>
    </>
  );
}

function PinBuffer() {
  return (
    <>
      <Ball cx={140} />
      <line x1={196} y1={36} x2={196} y2={200} className="stroke-ink-tertiary" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={202} y={196} className={LABEL}>
        VAL
      </text>
      <line x1={196} y1={118} x2={148} y2={62} className="stroke-accent" strokeWidth={2} />
      <text x={142} y={96} textAnchor="end" className={ACCENT_LABEL}>
        Pin to PAP
      </text>
      <circle cx={196} cy={118} r={5} className="fill-accent" />
      <text x={204} y={122} className={ACCENT_LABEL}>
        PAP
      </text>
      <circle cx={148} cy={62} r={6} className="fill-warning-700" />
      <text x={148} y={48} textAnchor="middle" className={PIN_LABEL}>
        Pin
      </text>
      {/* The buffer is the square distance across to the VAL, not along the pin
          line, so it is drawn with the right angle showing. */}
      <line x1={148} y1={62} x2={196} y2={62} className="stroke-warning-700" strokeWidth={1.6} strokeDasharray="4 3" />
      <path d="M 186 62 L 186 72 L 196 72" fill="none" className="stroke-warning-700" strokeWidth={1} />
      <text x={204} y={66} className={PIN_LABEL}>
        Pin buffer
      </text>
    </>
  );
}

const FIGURES: Record<GuideFigureId, () => JSX.Element> = {
  "ball-points": BallPoints,
  "dual-angles": DualAngles,
  "flare-rings": FlareRings,
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
