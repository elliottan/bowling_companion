import { useState } from "react";
import type { Manufacturer } from "../types/catalog";

// Brand colors for the ball silhouette placeholder.
// Chosen to be visually distinct and on-brand for each manufacturer.
const BRAND_COLORS: Record<Manufacturer, { bg: string; accent: string }> = {
  "Storm":      { bg: "#1e3a5f", accent: "#e63946" },   // Storm navy + red
  "Roto Grip":  { bg: "#1b4332", accent: "#52b788" },   // Roto green tones
  "900 Global": { bg: "#4a1942", accent: "#c77dff" },   // 900G purple tones
  "Motiv":      { bg: "#7c2d12", accent: "#fb923c" },   // Motiv orange/burnt
};

interface CatalogBallImageProps {
  src: string | null;
  alt: string;
  brand: Manufacturer;
  size: "thumb" | "full";
}

/** Ball silhouette SVG placeholder — brand-colored, no broken-image glyph. */
function BallPlaceholder({ brand, size }: { brand: Manufacturer; size: "thumb" | "full" }) {
  const colors = BRAND_COLORS[brand];
  const r = size === "full" ? 100 : 60;
  const viewSize = r * 2 + 8;
  return (
    <svg
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      {/* Ball body */}
      <circle cx={viewSize / 2} cy={viewSize / 2} r={r} fill={colors.bg} />
      {/* Finger-hole row — decorative */}
      <circle cx={viewSize / 2 - r * 0.22} cy={viewSize / 2 - r * 0.15} r={r * 0.08} fill={colors.accent} opacity="0.6" />
      <circle cx={viewSize / 2 + r * 0.04} cy={viewSize / 2 - r * 0.22} r={r * 0.08} fill={colors.accent} opacity="0.6" />
      <circle cx={viewSize / 2 + r * 0.24} cy={viewSize / 2 - r * 0.08} r={r * 0.08} fill={colors.accent} opacity="0.6" />
      {/* Highlight sheen */}
      <ellipse
        cx={viewSize / 2 - r * 0.25}
        cy={viewSize / 2 - r * 0.3}
        rx={r * 0.22}
        ry={r * 0.14}
        fill="white"
        opacity="0.12"
        transform={`rotate(-30 ${viewSize / 2} ${viewSize / 2})`}
      />
    </svg>
  );
}

// Sources that have already decoded once this session. Callers remount this
// component freely — the shot panel rebuilds on every shot change — and without
// this the placeholder flashes and the fade replays for a picture the browser
// already holds. Survives remounts, not reloads; the `complete` check below
// covers a reload served from the HTTP cache.
const decodedSrcs = new Set<string>();

export function CatalogBallImage({ src, alt, brand, size }: CatalogBallImageProps) {
  // Cached on the first render, so a known source paints opaque immediately
  // rather than starting transparent and being faded in.
  const [wasDecoded] = useState(() => !!src && decodedSrcs.has(src));
  const [loaded, setLoaded] = useState(wasDecoded);
  const [errored, setErrored] = useState(false);

  function markLoaded() {
    if (src) decodedSrcs.add(src);
    setLoaded(true);
  }

  return (
    // Reserved aspect-ratio box — prevents layout shift regardless of load state.
    // The SVG silhouette is always rendered underneath; the img fades in on load.
    <div className="relative w-full overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: "1 / 1" }}>
      <BallPlaceholder brand={brand} size={size} />

      {src && !errored && (
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          // An image the browser already has decodes before this ref runs, so
          // `onLoad` never fires for it — check `complete` instead of waiting.
          ref={(el) => {
            if (!loaded && el?.complete && el.naturalWidth > 0) markLoaded();
          }}
          onLoad={markLoaded}
          onError={() => setErrored(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            wasDecoded ? "duration-0" : "duration-300"
          } ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
