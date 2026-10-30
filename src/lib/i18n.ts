import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";

/**
 * Which language the app speaks (ADR-220, docs/I18N.md).
 *
 * The language is chosen once, at start, from the phone's or browser's
 * preferred languages, and changing it is a reload. So a message is written
 * with the macros from `@lingui/core/macro` (`t`, `plural`, `msg`) and read
 * through the one global `i18n`, with no provider around the app.
 *
 * English is the source: its text sits in the components, and its catalog is
 * `src/locales/en/messages.po`. A catalog is a lazy chunk, loaded for the one
 * language in use, so a language added later costs nobody who does not use it.
 */

/** Every language a catalog exists for. Adding one is a line here, a line in
 *  `lingui.config.ts` and, on iOS, a line in Info.plist (docs/I18N.md). */
export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const SOURCE_LOCALE: Locale = "en";

/**
 * The supported language that best answers a list of preferred ones, in the
 * order the person ranked them. A regional tag ("ja-JP", "pt_BR") matches its
 * language's catalog when there is no catalog for the region itself, and a
 * list that matches nothing is the source language.
 */
export function resolveLocale(
  preferred: readonly string[],
  supported: readonly string[] = SUPPORTED_LOCALES
): string {
  const have = new Map(supported.map((s) => [s.toLowerCase(), s]));
  for (const raw of preferred) {
    const tag = raw.trim().replace(/_/g, "-").toLowerCase();
    if (!tag) continue;
    const exact = have.get(tag);
    if (exact) return exact;
    const base = have.get(tag.split("-")[0]);
    if (base) return base;
  }
  return SOURCE_LOCALE;
}

/** The phone's or browser's preferred languages, most wanted first. On iOS
 *  this is the per-app language once Info.plist declares which the app has. */
export function preferredLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function detectLocale(): string {
  return resolveLocale(preferredLanguages());
}

type CatalogModule = { messages: Messages };

// Lazy on purpose: one chunk per language, fetched only for that language.
const catalogs = import.meta.glob<CatalogModule>("../locales/*/messages.po");

/** Tells the page, and so a screen reader, which language it is written in. */
function setDocumentLanguage(locale: string) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/** The language the app is speaking now. */
export function activeLocale(): string {
  return i18n.locale || SOURCE_LOCALE;
}

/**
 * Loads a language's catalog and makes it the active one. Await it before the
 * first render, so no screen is drawn in the wrong language. A language whose
 * catalog cannot be loaded (a chunk that failed to arrive offline) leaves the
 * source language on: English is better than a blank screen.
 */
export async function activateLocale(locale: string): Promise<string> {
  const load = catalogs[`../locales/${locale}/messages.po`];
  if (!load) {
    if (locale !== SOURCE_LOCALE) return activateLocale(SOURCE_LOCALE);
    i18n.loadAndActivate({ locale: SOURCE_LOCALE, messages: {} });
    return SOURCE_LOCALE;
  }
  try {
    const { messages } = await load();
    i18n.loadAndActivate({ locale, messages });
    setDocumentLanguage(locale);
    return locale;
  } catch {
    if (locale !== SOURCE_LOCALE) return activateLocale(SOURCE_LOCALE);
    i18n.loadAndActivate({ locale: SOURCE_LOCALE, messages: {} });
    return SOURCE_LOCALE;
  }
}

/** Detects the language and starts it: the one call `main.tsx` makes. */
export function startI18n(): Promise<string> {
  return activateLocale(detectLocale());
}
