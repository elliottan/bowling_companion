import { t } from "@lingui/core/macro";
import { ChevronRight, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { CatalogBallImage } from "./CatalogBallImage";
import type { ToolsActions } from "./ToolsList";
import { GROUP_HEADING } from "./ui/typography";

/*
 * Small pictures of what each tool does, for Home's tool cards (ADR-244). They
 * are drawings, not the tools' own components: a card is a door, and the
 * screen behind it draws the real thing. Each is drawn to a 160 x 80 box and
 * fills its card's width.
 *
 * The lane and the oil keep their own colours in both themes, as a photo
 * would; the backgrounds behind the ball and the oil read the theme's tokens.
 */

/** A lane from the bowler's end: boards, the arrows, oil fading out down the
 *  lane, and a line hooking into the pocket. */
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
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={(i + 1) * 11.4} y1="0" x2={(i + 1) * 11.4} y2="80" stroke="#7a5532" strokeOpacity="0.35" />
      ))}
      <rect x="30" y="0" width="100" height="80" fill="url(#tool-lane-oil)" />
      {[45, 68, 92, 115].map((x) => (
        <path key={x} d={`M ${x} 52 l -3.5 8 h 7 z`} fill="#3b2410" opacity="0.7" />
      ))}
      <path d="M 100 80 C 112 46, 136 30, 98 4" fill="none" stroke="#2d8a78" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 100 80 C 112 46, 136 30, 98 4" fill="none" stroke="#5ed6c1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="98" cy="8" r="4.5" fill="#1e293b" stroke="#5ed6c1" strokeWidth="2" />
    </svg>
  );
}

/** A ball with its layout drawn on: the pin, the PAP, the VAL line and the
 *  grip. */
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
      <path d="M 52 44 Q 80 24 108 30" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.3" strokeDasharray="4 3" />
      <line x1="74" y1="16" x2="88" y2="64" stroke="#5ed6c1" strokeWidth="1.5" />
      <circle cx="76" cy="27" r="3.5" fill="#fff" />
      <circle cx="95" cy="38" r="3.5" fill="none" stroke="#5ed6c1" strokeWidth="2" />
      {[
        [73, 49],
        [82, 51],
        [77, 59]
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill="#0b0f1a" />
      ))}
    </svg>
  );
}

/** An oil pattern's load across the lane: heavy in the middle, light out to
 *  the edges, as the pattern sheets draw it. */
function OilArt() {
  const boards = 39;
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true">
      <rect width="160" height="80" className="fill-surface-muted" />
      {Array.from({ length: boards }, (_, i) => {
        const x = (i - (boards - 1) / 2) / ((boards - 1) / 2);
        const load = Math.max(0.08, Math.exp(-x * x * 2.2) * 0.9 + (Math.abs(x) < 0.75 ? 0.1 : 0));
        const h = load * 60;
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
  description,
  onClick
}: {
  art: ReactNode;
  label: string;
  description: string;
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
        <span className="mt-0.5 block text-caption leading-snug text-ink-secondary">{description}</span>
      </span>
    </button>
  );
}

/**
 * The tools on Home, as cards with a picture of what each does (ADR-244). A
 * row with a line under it described a tool; a picture makes it something to
 * try. Two by two, so the four sit as one block, and the guides as a row under
 * them. Settings keeps the plain list (`ToolsList`), which is a way back to
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
          description={t`Draw a line on the lane, over the oil`}
          onClick={open.onOpenLineVisualizer}
        />
        <ToolCard
          art={<LayoutArt />}
          label={t`Layouts`}
          description={t`A drilling layout, drawn on the ball`}
          onClick={open.onOpenLayoutLab}
        />
        <ToolCard
          art={<OilArt />}
          label={t`Oil patterns`}
          description={t`Look up a pattern's length and oil`}
          onClick={open.onOpenOilPatterns}
        />
        <ToolCard
          art={<CatalogArt />}
          label={t`Ball catalog`}
          description={t`Specs and pictures of current balls`}
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
          <span className="block text-footnote leading-snug text-ink-secondary">{t`Using Headpin, layouts and equipment`}</span>
        </span>
        <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </section>
  );
}
