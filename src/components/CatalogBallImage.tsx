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

export function CatalogBallImage({ src, alt, brand, size }: CatalogBallImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    // Reserved aspect-ratio box — prevents layout shift regardless of load state.
    // The SVG silhouette is always rendered underneath; the img fades in on load.
    <div className="relative w-full overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: "1 / 1" }}>
      <BallPlaceholder brand={brand} size={size} />

      {src && !errored && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
