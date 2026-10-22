/**
 * The small uppercase group heading from `docs/DESIGN-LANGUAGE.md` §8, as one
 * string rather than ten copies. Ten files had spelled it out by hand, which is
 * how a set of nearly-identical headings drifts apart.
 */
export const GROUP_HEADING = "text-xs font-semibold uppercase tracking-wide text-ink-secondary";

/**
 * A tab's title, and the row it sits in. The row is as tall as the round
 * controls beside the title (44pt), whether a tab has any or not, so every
 * tab's title lands on the same line: Score, which has none, sat 8px higher
 * than History, Stats and Settings, and so did History before its first
 * session gave it a filter button.
 */
export const TAB_TITLE = "text-xl font-bold text-ink";

/**
 * iOS's large title, for a tab whose header carries nothing else to keep in
 * view (Settings): it scrolls away with the page, and the tab's name comes in
 * small and centred in a frosted bar as it goes (`CompactTitleBar`, ADR-191).
 * A tab whose controls stay pinned (History, Stats) keeps `TAB_TITLE`.
 */
export const LARGE_TITLE = "text-[34px] font-bold leading-tight tracking-tight text-ink";
export const TAB_TITLE_ROW = "flex min-h-11 items-center";
