/** @type {import('tailwindcss').Config} */

// Semantic tokens resolve to CSS variables (defined in src/index.css) so they
// can flip between light and dark without touching call sites. The channel
// triples pair with `/ <alpha-value>` so opacity utilities (bg-surface/60)
// still work. `felt` and `lane` stay static — they are brand identity, not
// theme-dependent surfaces. `accent` is felt used as interactive text/icon,
// which unlike the felt fill must lighten on a dark background.
const withVar = (v) => `rgb(var(${v}) / <alpha-value>)`;

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
