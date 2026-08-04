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
  { ignores: ["dist", "dev-dist", "coverage", "playwright-report", "test-results", "tmp"] },
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
      // Two rules from the compiler-era ruleset fire on patterns this app uses
      // deliberately and everywhere: loading data in a mount effect, and the
      // dismiss/exit timers that read a ref while rendering their transform.
      // Warnings, so the signal stays visible without a 28-error wall that
      // nobody can act on in one sitting. Worth revisiting as its own change.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // The one hook rule that has caught real bugs elsewhere in this app's
      // history: an effect reading a value it never re-subscribes to. Any
      // deliberate exception carries a disable comment saying why.
      "react-hooks/exhaustive-deps": "error",
      // Vite's fast refresh only works when a module exports components alone.
      // A warning, not an error: a few files intentionally export a class
      // constant beside their component.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // `_`-prefixed names are the established way to say "deliberately unused"
      // (destructuring a field out of an object, an ignored callback argument).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
      ]
    }
  }
);
