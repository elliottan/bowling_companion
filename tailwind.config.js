/** @type {import('tailwindcss').Config} */

// Semantic tokens resolve to CSS variables (defined in src/index.css) so they
// can flip between light and dark without touching call sites. The channel
// triples pair with `/ <alpha-value>` so opacity utilities (bg-surface/60)
// still work. `felt` and `lane` stay static — they are brand identity, not
// theme-dependent surfaces. `accent` is felt used as interactive text/icon,
// which unlike the felt fill must lighten on a dark background.
const withVar = (v) => `rgb(var(${v}) / <alpha-value>)`;

// The type scale (ADR-219). Apple's text styles, in rem, so the browser's own
// default size scales it. Every size is also multiplied by `--type-scale`, which
// `src/index.css` builds from the phone's text size and the bowler's Text size
// setting (`src/lib/textScale.ts`); a dense surface re-points it lower with
// `.type-cap-dense` or `.type-cap-fixed`. Only type scales with it: spacing
// stays in rem, so a larger size grows the words, not the whole layout.
const scaled = (rem) => `calc(${rem}rem * var(--type-scale, 1))`;
// No line height on the named styles: the page's 1.5 (unitless, so it follows
// the size) is what every call site was laid out against, and each pairs its
// own `leading-*` where it wants tighter.
const style = (rem, weight) => (weight ? [scaled(rem), { fontWeight: weight }] : scaled(rem));
// Tailwind's own names, kept at their old sizes and line heights so existing
// markup does not move, but on the same multiplier.
const legacy = (rem, lh) => [scaled(rem), { lineHeight: scaled(lh) }];

export default {
  // `hover:` compiles to `@media (hover: hover)`, so it never applies on a
  // touch screen. iOS *latches* :hover on tap and only clears it when
  // something else is tapped, so a tapped control kept its hover background
  // and read as a button stuck down: the session header and the series score
  // both did it, and holding a sheet open over one did not clear it either.
  // Touch feedback belongs in `active:`, which releases on pointerup.
  future: { hoverOnlyWhenSupported: true },
  // A pre-paint script in index.html resolves prefers-color-scheme (and any
  // stored override) into a data-theme attribute on <html>, so this attribute
  // is always the single source of truth. Rare explicit dark: variants key off
  // it; most themed color comes from the variable-backed tokens above.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Replaces Tailwind's default sizes rather than extending them, so every
    // size on screen is on this list (and a test forbids a px size written as
    // an arbitrary value).
    fontSize: {
      "large-title": style(2.125),
      "title-1": style(1.75),
      "title-2": style(1.375),
      "title-3": style(1.25),
      headline: style(1.0625, "600"),
      body: style(1.0625),
      callout: style(1),
      subhead: style(0.9375),
      footnote: style(0.8125),
      caption: style(0.75),
      "caption-2": style(0.6875),
      // Pin numbers inside a pin drawn 12 and 14px across (`MiniPins`). They
      // sit in a fixed shape, so they do not take the multiplier, and they are
      // decoration: the diagram's accessible name says which pins stand.
      "pin-xs": "0.375rem",
      "pin-sm": "0.4375rem",
      xs: legacy(0.75, 1),
      sm: legacy(0.875, 1.25),
      base: legacy(1, 1.5),
      lg: legacy(1.125, 1.75),
      xl: legacy(1.25, 1.75),
      "2xl": legacy(1.5, 2),
      "3xl": legacy(1.875, 2.25),
      "4xl": legacy(2.25, 2.5),
      "5xl": legacy(3, 1),
      "6xl": legacy(3.75, 1)
    },
    extend: {
      colors: {
        lane: {
          50: "#fff8ed",
          100: "#f6e3c5"
        },
        felt: {
          50: "#f0f7f5",
          100: "#d9e9e5",
          500: "#256f61",
          600: "#206054",
          700: "#1b5148",
          800: "#143d36"
        },
        accent: {
          DEFAULT: withVar("--color-accent"),
          soft: withVar("--color-accent-soft"),
          // Brand fill for primary buttons/badges. A token, not static felt-700,
          // because felt-700 on the dark background measures 1.97:1 — the button
          // shape itself disappears. Lightens in dark to clear 3:1.
          fill: withVar("--color-accent-fill"),
          "fill-hover": withVar("--color-accent-fill-hover"),
          "on-fill": withVar("--color-accent-on-fill")
        },
        surface: {
          DEFAULT: withVar("--color-surface"),
          sunken: withVar("--color-surface-sunken"),
          muted: withVar("--color-surface-muted")
        },
        ink: {
          DEFAULT: withVar("--color-ink"),
          strong: withVar("--color-ink-strong"),
          secondary: withVar("--color-ink-secondary"),
          tertiary: withVar("--color-ink-tertiary")
        },
        edge: {
          DEFAULT: withVar("--color-edge"),
          strong: withVar("--color-edge-strong")
        },
        danger: {
          50: withVar("--color-danger-50"),
          200: withVar("--color-danger-200"),
          600: withVar("--color-danger-600"),
          700: withVar("--color-danger-700")
        },
        success: {
          50: withVar("--color-success-50"),
          200: withVar("--color-success-200"),
          700: withVar("--color-success-700")
        },
        warning: {
          50: withVar("--color-warning-50"),
          200: withVar("--color-warning-200"),
          700: withVar("--color-warning-700")
        }
      }
    }
  },
  plugins: []
};
