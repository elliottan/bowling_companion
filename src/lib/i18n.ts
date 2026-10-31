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
export const SUPPORTED_LOCALES = ["en", "es", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
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
    const script = chineseScript(tag);
    const written = script && have.get(`zh-${script}`);
    if (written) return written;
    const base = have.get(tag.split("-")[0]);
    if (base) return base;
  }
  return SOURCE_LOCALE;
}

/**
 * Which script a Chinese tag is written in, "hant" or "hans", or null for a
 * tag that is not Chinese. Chinese is matched by script, not by language: a
 * phone in Taiwan says "zh-TW" or "zh-Hant-TW", and neither is a "zh-Hant"
 * catalog by its letters. Taiwan, Hong Kong and Macau write Traditional; a
 * Chinese tag with neither a script nor one of those regions is Simplified
 * (mainland China, Singapore, Malaysia). Neither script ever gets the other's
 * catalog.
 */
function chineseScript(tag: string): "hant" | "hans" | null {
  const parts = tag.split("-");
  if (parts[0] !== "zh") return null;
  if (parts.includes("hant")) return "hant";
  if (parts.includes("hans")) return "hans";
  return parts.some((p) => p === "tw" || p === "hk" || p === "mo") ? "hant" : "hans";
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

/**
 * Each language by its own name, never translated: a bowler looking for their
 * language reads it in that language. In the order the picker lists them.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文"
};

const LANGUAGE_KEY = "language";

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

/**
 * The language the bowler picked in Settings, or null to follow the phone. It
 * lives in localStorage, as the text size does, because it is read before the
 * first screen is drawn. It is this device's alone, and not in a backup: a
 * restored file should not change the language of the phone it lands on.
 */
export function readLanguagePreference(): Locale | null {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberLanguagePreference(locale: Locale | null) {
  try {
    if (locale) localStorage.setItem(LANGUAGE_KEY, locale);
    else localStorage.removeItem(LANGUAGE_KEY);
  } catch {
    // Private mode: the choice holds until the app is closed.
  }
}

/** The bowler's pick if there is one, else the phone's best match. */
export function chooseLocale(): string {
  return readLanguagePreference() ?? detectLocale();
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

/** Chooses the language and starts it: the one call `main.tsx` makes. */
export function startI18n(): Promise<string> {
  return activateLocale(chooseLocale());
}
