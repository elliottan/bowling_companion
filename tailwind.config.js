/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lane: {
          50: "#fff8ed",
          100: "#f6e3c5",
          700: "#8a5b23",
          900: "#36220e"
        },
        felt: {
          500: "#256f61",
          700: "#1b5148"
        }
      }
    }
  },
  plugins: []
};
