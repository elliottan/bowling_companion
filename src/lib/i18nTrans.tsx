import { i18n } from "@lingui/core";
import { TransNoContext, type TransProps } from "@lingui/react/server";

/**
 * The runtime half of the `<Trans>` macro (ADR-223), for a sentence with
 * markup in it: a bold word, an icon. Lingui's own `Trans` reads its `i18n`
 * from an `I18nProvider`, and the app has none (one language per launch, so
 * nothing to re-render on a change, ADR-220). This one reads the global `i18n`,
 * as `t` does. `lingui.config.ts` points the macro here, through the
 * `@headpin/trans` alias in vite.config.ts.
 *
 * Write the macro from `@lingui/react/macro`, never this component directly.
 */
export function Trans(props: TransProps) {
  return <TransNoContext {...props} lingui={{ i18n }} />;
}
