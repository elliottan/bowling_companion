import { useId } from "react";

/**
 * The Headpin Pro mark (ADR-167): the app's pin, on graphite instead of felt,
 * with gold bands and "PRO" set under it. It stands for Pro wherever the app
 * names it: the Pro page, the rows and banners that open it, and the app's own
 * mark on Home once this copy has Pro.
 *
 * The pin is the one in `scripts/pin-mark.mjs`, so the two marks are one
 * drawing in two colors. Below about 32px the word is too small to read, so the
 * small mark is the pin alone and its colors carry it.
 */

const PIN_PATH =
  "M 50 5 C 57 5 63 11 63 20 C 63 30 60 40 60 52 C 60 64 63 70 67 80 C 72 91 76 100 76 114 " +
  "C 76 130 71 143 65 149 L 65 151 L 35 151 L 35 149 C 29 143 24 130 24 114 C 24 100 28 91 33 80 " +
  "C 37 70 40 64 40 52 C 40 40 37 30 37 20 C 37 11 43 5 50 5 Z";

/** The mark's own colors. They are not theme tokens: a logo is the same in
 *  light and dark, as the felt icon is. */
export const PRO_GOLD = "#e9b949";
const GRAPHITE_TOP = "#27303d";
const GRAPHITE_BOTTOM = "#0f141b";
const CREAM = "#fff8ed";

export function ProMark({
  size = 44,
  word = size >= 32,
  className = "",
  title
}: {
  size?: number;
  /** "PRO" under the pin. On by default where it can be read. */
  word?: boolean;
  className?: string;
  /** Spoken name. Without one the mark is decoration and hidden from readers. */
  title?: string;
}) {
  // An id per mark, so two on one screen do not share one gradient. React's
  // ids carry colons, which `url(#...)` does not take everywhere.
  const ground = `pro-ground-${useId().replace(/:/g, "")}`;
  // The pin sits higher and smaller with the word under it.
  const pinH = word ? 58 : 72;
  const scale = pinH / 154;
  const x = (100 - 100 * scale) / 2;
  const y = word ? 8 : (100 - pinH) / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`shrink-0 ${className}`.trim()}
    >
      <defs>
        <linearGradient id={ground} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GRAPHITE_TOP} />
          <stop offset="1" stopColor={GRAPHITE_BOTTOM} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${ground})`} />
      {/* A hairline of gold inside the edge, so the dark tile holds its shape
          on a dark screen. */}
      <rect x="1.5" y="1.5" width="97" height="97" rx="21.5" fill="none" stroke={PRO_GOLD} strokeOpacity="0.35" strokeWidth="1.5" />
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <path d={PIN_PATH} fill={CREAM} />
        <rect x="41" y="44" width="18" height="5" rx="2.5" fill={PRO_GOLD} />
        <rect x="41" y="53" width="18" height="5" rx="2.5" fill={PRO_GOLD} />
      </g>
      {word && (
        <text
          x="50"
          y="88"
          textAnchor="middle"
          fill={PRO_GOLD}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
          fontSize="17"
          fontWeight="800"
          letterSpacing="3.5"
        >
          {/* The letter spacing trails the last letter too, so a space's worth
              of indent on the left keeps the word centered. */}
          <tspan dx="1.75">PRO</tspan>
        </text>
      )}
    </svg>
  );
}
