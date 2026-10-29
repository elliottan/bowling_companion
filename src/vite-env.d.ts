/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Baked in by vite.config.ts `define`, for the diagnostics block. */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

/** A compiled Lingui catalog: `src/locales/<locale>/messages.po` (ADR-220). */
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
