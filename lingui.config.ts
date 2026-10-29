import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * Translation catalogs (ADR-220, docs/I18N.md). English is the source: its
 * text lives in the components, beside the code that shows it, and
 * `npm run i18n:extract` writes it to `src/locales/en/messages.po`. Adding a
 * language is adding its code to `locales` here and in `src/lib/i18n.ts`,
 * extracting, and translating the new file.
 */
export default defineConfig({
  sourceLocale: "en",
  locales: ["en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"]
    }
  ],
  // No line numbers: they change on every edit above a string, which would
  // make every extract a diff and the check below useless.
  format: formatter({ lineNumbers: false })
});
