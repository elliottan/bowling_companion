import { t } from "@lingui/core/macro";
import { ChevronRight, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { CatalogBallImage } from "./CatalogBallImage";
import type { ToolsActions } from "./ToolsList";
import { GROUP_HEADING } from "./ui/typography";

/*
 * Small pictures of what each tool does, for Home's tool cards (ADR-245). They
 * are drawings, not the tools' own components: a card is a door, and the
 * screen behind it draws the real thing. Each is drawn to a 160 x 80 box and
 * fills its card's width.
 *
 * The lane and the oil keep their own colours in both themes, as a photo
 * would; the backgrounds behind the ball and the oil read the theme's tokens.
 */

/** The lane is 39 boards, and the targeting arrows sit on every fifth one in
 *  a V: the middle arrow (board 20) furthest down the lane, each pair out from
 *  it a step closer to the bowler. Board 1 is on the right, for a
 *  right-hander. */
const BOARD_W = 160 / 39;
const boardX = (board: number) => 160 - (board - 0.5) * BOARD_W;
const ARROWS = [5, 10, 15, 20, 25, 30, 35].map((board) => ({
  x: boardX(board),
  y: 44 + Math.abs(board - 20) * 0.9
}));

/** A lane from the bowler's end: boards, the arrows, oil fading out down the
 *  lane, and a right-hander's line out over the second arrow and back into
 *  the pocket. */
function LaneArt() {
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="tool-lane-oil" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f2c14e" stopOpacity="0.45" />
          <stop offset="0.75" stopColor="#f2c14e" stopOpacity="0.06" />
          <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="160" height="80" fill="#b8854f" />
      {Array.from({ length: 38 }, (_, i) => (
        <line
          key={i}
          x1={(i + 1) * BOARD_W}
          y1="0"
          x2={(i + 1) * BOARD_W}
          y2="80"
          stroke="#7a5532"
          strokeOpacity={(i + 1) % 5 === 0 ? 0.4 : 0.18}
          strokeWidth="0.6"
        />
      ))}
      <rect x={boardX(32)} y="0" width={boardX(8) - boardX(32)} height="80" fill="url(#tool-lane-oil)" />
      {ARROWS.map(({ x, y }) => (
        <path key={x} d={`M ${x} ${y} l -2.6 7 h 5.2 z`} fill="#3b2410" opacity="0.75" />
      ))}
      <path d="M 106 80 C 117 60, 136 32, 96 4" fill="none" stroke="#2d8a78" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 106 80 C 117 60, 136 32, 96 4" fill="none" stroke="#5ed6c1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="96" cy="8" r="4.5" fill="#1e293b" stroke="#5ed6c1" strokeWidth="2" />
    </svg>
  );
}

/** A ball drilled with the Benchmark layout (45 x 4 1/2 x 45) for a
 *  right-hander, seen as the layout lab opens on it. The points are that
 *  layout's own, from `layoutGeometry` and `gripHoles` projected onto this
 *  circle, written down rather than computed so the card stays a drawing:
 *  the pin over the ring finger, the PAP out to the right of the grip, the
 *  VAL through the PAP and the pin-to-PAP line between them. */
function LayoutArt() {
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="tool-layout-ball" cx="0.35" cy="0.3">
          <stop offset="0" stopColor="#ff8fab" />
          <stop offset="0.55" stopColor="#b5179e" />
          <stop offset="1" stopColor="#3a0c3a" />
        </radialGradient>
      </defs>
      <rect width="160" height="80" className="fill-surface-muted" />
      <circle cx="80" cy="41" r="32" fill="url(#tool-layout-ball)" />
      {/* The VAL, through the PAP. */}
      <path
        d="M 87 72.2 L 95.4 66.1 L 100.5 54.6 L 101.1 40.1 L 97.2 25.8 L 89.5 14.8 L 79.7 9.5"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.8"
        strokeWidth="1.2"
        strokeDasharray="3.5 2.5"
        strokeLinejoin="round"
      />
      {/* Pin to PAP. */}
      <path d="M 73.4 23.5 L 81 26.4 L 88.4 30.4 L 95.3 35 L 101.1 40.1" fill="none" stroke="#5ed6c1" strokeWidth="1.5" />
      {/* The grip: two finger holes level with each other, the thumb a span below. */}
      <circle cx="62" cy="28.7" r="3" fill="#0b0f1a" />
      <circle cx="74.1" cy="29.4" r="3" fill="#0b0f1a" />
      <circle cx="67.8" cy="59.3" r="3.6" fill="#0b0f1a" />
      <circle cx="73.4" cy="23.5" r="2.3" fill="#fff" />
      <circle cx="101.1" cy="40.1" r="3.2" fill="none" stroke="#5ed6c1" strokeWidth="1.8" />
    </svg>
  );
}

/** Board totals of Kegel's Main Street V2, a real house shot, each board's share
 *  of the heaviest: a low buffer outside, a step up past the 7, and a flat
 *  crown across the middle, as the pattern sheets draw it. */
const OIL_LOAD = [
  0, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.2, 0.2, 0.44, 0.56, 0.56, 0.84, 0.96, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0.96, 0.84, 0.56, 0.56, 0.44, 0.2, 0.2, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0
];

/** An oil pattern's load across the lane, board by board. */
function OilArt() {
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true">
      <rect width="160" height="80" className="fill-surface-muted" />
      {OIL_LOAD.map((load, i) => {
        // An empty board keeps a sliver, so the lane's edge still reads.
        const h = Math.max(1.5, load * 58);
        return (
          <rect
            key={i}
            x={6 + i * 3.82}
            y={72 - h}
            width="2.6"
            height={h}
            rx="0.8"
            fill="#e0a526"
            fillOpacity={0.35 + load * 0.6}
          />
        );
      })}
    </svg>
  );
}

/** Real balls from the catalog, fanned out. */
const CATALOG_BALLS = [
  { src: "/catalog/img/roto-grip-idol-2018-p2-thumb.webp", brand: "Roto Grip" },
  { src: "/catalog/img/storm-phaze-2-2019-p2-thumb.webp", brand: "Storm" },
  { src: "/catalog/img/hammer-purple-pearl-urethane-78d-2026-p2-thumb.webp", brand: "Hammer" }
] as const;

function CatalogArt() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted" aria-hidden="true">
      {CATALOG_BALLS.map((ball, i) => (
        <span
          key={ball.src}
          className={`shrink-0 rounded-full shadow-md ${i === 1 ? "z-10 h-16 w-16" : "h-12 w-12"} ${i > 0 ? "-ml-3" : ""}`}
        >
          <CatalogBallImage src={ball.src} alt="" brand={ball.brand} size="thumb" bare />
        </span>
      ))}
    </div>
  );
}

function ToolCard({
  art,
  label,
  onClick
}: {
  art: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-button flex min-w-0 flex-col overflow-hidden rounded-[22px] text-left"
    >
      <span className="block aspect-[2/1] w-full overflow-hidden">{art}</span>
      {/* Hyphenated and free to break: at the largest text size a long word
          ("Especificaciones") is wider than half the screen. */}
      <span className="block w-full hyphens-auto px-3 pb-3 pt-2 [overflow-wrap:anywhere]">
        <span className="block text-subhead font-semibold leading-tight text-ink">{label}</span>
      </span>
    </button>
  );
}

/**
 * The tools on Home, as cards with a picture of what each does (ADR-245). A
 * row with a line under it described a tool; a picture makes it something to
 * try. Two by two, so the four sit as one block, and the guides as a row under
 * them. A card is its title alone: the drawing says what the tool does. Settings keeps the plain list (`ToolsList`), which is a way back to
 * them, not a showcase.
 */
export function ToolCards({ heading, ...open }: ToolsActions & { heading: string }) {
  return (
    <section>
      <h2 className={`${GROUP_HEADING} mb-1.5 px-4`}>{heading}</h2>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
        <ToolCard
          art={<LaneArt />}
          label={t`Line visualizer`}
          onClick={open.onOpenLineVisualizer}
        />
        <ToolCard
          art={<LayoutArt />}
          label={t`Layouts`}
          onClick={open.onOpenLayoutLab}
        />
        <ToolCard
          art={<OilArt />}
          label={t`Oil patterns`}
          onClick={open.onOpenOilPatterns}
        />
        <ToolCard
          art={<CatalogArt />}
          label={t`Ball catalog`}
          onClick={open.onOpenCatalog}
        />
      </div>
      <button
        type="button"
        onClick={open.onOpenGuides}
        className="card-button mt-2.5 flex min-h-[52px] w-full items-center gap-3.5 rounded-[22px] px-4 py-2.5 text-left"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent">
          <GraduationCap size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body leading-snug text-ink">{t`Guides`}</span>
          <span className="block text-footnote leading-snug text-ink-secondary">{t`Using Headpin, bowling terms, layouts and equipment`}</span>
        </span>
        <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </section>
  );
}
