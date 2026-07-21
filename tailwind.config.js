/** @type {import('tailwindcss').Config} */
export default {
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
        // Role-named tokens mirroring the slate/red/emerald values already in
        // use across the app. Pending call-site migration.
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#fff8ed",
          muted: "#f8fafc"
        },
        ink: {
          DEFAULT: "#020617",
          secondary: "#64748b",
          tertiary: "#94a3b8"
        },
        edge: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1"
        },
        danger: {
          50: "#fef2f2",
          200: "#fecaca",
          600: "#dc2626",
          700: "#b91c1c"
        },
        success: {
          50: "#ecfdf5",
          200: "#a7f3d0",
          700: "#047857"
        }
      }
    }
  },
  plugins: []
};
