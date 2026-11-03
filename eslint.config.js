import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * The repo carried `eslint-disable react-hooks/exhaustive-deps` comments long
 * before it carried an ESLint, so the rule they silence had never actually run.
 * This config exists mainly for the hooks rules: `tsc` cannot see a stale
 * dependency array, a conditionally called hook, or a missing effect cleanup,
 * and this app leans hard on effects.
 *
 * Type-aware linting is deliberately left off: it needs a second full
 * typecheck, and `npm run build` already runs `tsc -b` over the same files.
 */
export default tseslint.config(
  { ignores: ["dist", "dist-native", "ios", "android", "dev-dist", "coverage", "playwright-report", "test-results", "tmp"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Two rules from the compiler-era ruleset. Both were warnings while the
      // app carried 14 hits; those are fixed or carry a disable comment that
      // says why the effect is the right place (a subscription, an async
      // reset, a once-only prompt), so a new one is now a decision to write
      // down rather than a warning to scroll past.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      // The one hook rule that has caught real bugs elsewhere in this app's
      // history: an effect reading a value it never re-subscribes to. Any
      // deliberate exception carries a disable comment saying why.
      "react-hooks/exhaustive-deps": "error",
      // Vite's fast refresh only works when a module exports components alone.
      // Helpers and lookup tables live in a sibling module (`statsMetrics`,
      // `driftZoneAccent`, `lib/patternFilters`) instead; a literal constant
      // beside a component is still allowed.
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      // `_`-prefixed names are the established way to say "deliberately unused"
      // (destructuring a field out of an object, an ignored callback argument).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
      ]
    }
  }
);
