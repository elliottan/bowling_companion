/** How far a page scrolls before its large title has gone under the bar, and
 *  the small one takes over: the title row's height, near enough. */
export const LARGE_TITLE_SCROLL_PX = 44;

/**
 * The bar a large title collapses into, as iOS draws it (ADR-191): the tab's
 * name, small and centred, over the same frosted ground as the pinned headers
 * (`.floating-header-ground`). It is nothing until the large title has scrolled
 * away, and then it fades in, so the name is never on screen twice. The large
 * title is the heading; this is a picture of it, kept out of the
 * accessibility tree.
 */
export function CompactTitleBar({ title, shown }: { title: string; shown: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-compact-title=""
      className={`pointer-events-none absolute inset-x-0 top-0 z-10 transition-opacity duration-200 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="floating-header-ground absolute inset-x-0 -bottom-5 top-0" />
      <p className="relative flex h-11 items-center justify-center text-body font-semibold text-ink">{title}</p>
    </div>
  );
}
