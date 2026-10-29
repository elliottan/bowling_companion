import { activeLocale } from "./i18n";

/**
 * Numbers and dates, written the way the app's language writes them (ADR-220).
 *
 * Everything on screen that is a number with a decimal point or a percent sign,
 * or a date, goes through here rather than `toFixed`, a template with a `%` in
 * it, or `toLocaleDateString`. In German a one-decimal average is "187,5" and a
 * percent is "73 %", and a hand-built string gets both wrong. Each formatter
 * reads the active language when it is called, never at import, so a module
 * level constant that calls one would be fixed to English: call them in render.
 *
 * A formatter is cached per language and option set, because building an `Intl`
 * formatter is the costly part and a list of sixty rows would build sixty.
 */

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = activeLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numbers.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numbers.set(key, format);
  }
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = activeLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dates.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dates.set(key, format);
  }
  return format;
}

/** A whole number, or one with up to `maxDecimals` places: a count, a pin total. */
export function formatNumber(value: number, maxDecimals = 0): string {
  return numberFormat({ maximumFractionDigits: maxDecimals }).format(value);
}

/** A number with exactly `decimals` places: an RG of 2.50, a diff of 0.016, a
 *  volume of 22.40 mL. The zeros are the reading's precision, so they stay. */
export function formatFixed(value: number, decimals: number): string {
  return numberFormat({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** An average, to one decimal place: "187.5". */
export function formatAverage(value: number): string {
  return formatFixed(value, 1);
}

/** A percent given as a number from 0 to 100 (that is how rates are stored):
 *  73 is "73%", and "73 %" where the language puts a space. */
export function formatPercent(percent: number, decimals = 0): string {
  return numberFormat({
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(percent / 100);
}

/** An oil ratio, "3.2:1". The colon is a notation, not punctuation, so it is
 *  the same in every language and only the number is localised. */
export function formatRatio(value: number, decimals = 1): string {
  return `${formatFixed(value, decimals)}:1`;
}

/** A date in the app's language, with the parts `options` asks for. */
export function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return dateFormat(options).format(date);
}
