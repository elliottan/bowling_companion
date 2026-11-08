/**
 * How wide a table column must be to hold its heading, in rem.
 *
 * A column in these tables is as wide as its numbers (a fixed rem times
 * `--type-scale`), and its heading is a word in the active language: "Strike"
 * in English, "Chuzas" in Spanish, "ストライク" in Japanese. A heading wider
 * than its column ran into its neighbour or, with `overflow-wrap: anywhere`,
 * broke inside the word. The rows are separate boxes, so the columns line up
 * only if every row is given the same width; this is that width, worked out
 * from the heading rather than guessed per language.
 *
 * A heading may wrap between words, so the column holds its longest word. It
 * is an estimate of a bold uppercase heading at `caption-2` (11px), generous
 * on purpose: too wide costs a little name space, too narrow breaks a word.
 */

/** Hangul, kana, Han and the fullwidth forms: one em wide each. */
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;

/** `caption-2` in rem (11px). */
const HEADING_EM = 11 / 16;
/** An uppercase bold Latin letter, in em: wide letters like M and W included. */
const LATIN_EM = 0.72;
/** Breathing room so two headings never touch. */
const GAP_REM = 0.25;

export function headingWidthRem(label: string): number {
  return longestWordEm(label, true) * HEADING_EM + GAP_REM;
}

/** A lowercase or mixed-case Latin letter in a semibold face, in em. */
const LATIN_MIXED_EM = 0.6;

/**
 * The width of a label's longest word, in em of its own type: an estimate,
 * generous on purpose. Words are what a line may break between, so a hyphen
 * or slash ends one too. `upper` for type drawn in capitals.
 */
export function longestWordEm(label: string, upper = false): number {
  const latin = upper ? LATIN_EM : LATIN_MIXED_EM;
  let longest = 0;
  for (const word of label.split(/[\s\-\u2010/]+/)) {
    let em = 0;
    for (const ch of word) em += WIDE.test(ch) ? 1 : latin;
    longest = Math.max(longest, em);
  }
  return longest;
}

/**
 * A column's width: the larger of its numbers' width and its heading's.
 * `numbersRem` is multiplied by the type scale, as the numbers are; pass
 * `scaled` when the heading is too.
 */
export function columnWidth(numbersRem: number, headings: string[], scaled = false): string {
  const heading = Math.max(0, ...headings.map(headingWidthRem)).toFixed(2);
  // A heading that follows the type scale grows with it; one held at its base
  // size (`type-cap-fixed`) does not.
  const headingWidth = scaled ? `calc(${heading}rem * var(--type-scale))` : `${heading}rem`;
  return `max(calc(${numbersRem}rem * var(--type-scale)), ${headingWidth})`;
}
