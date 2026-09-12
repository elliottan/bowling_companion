import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject, UIEvent } from "react";
import { useHeaderCollapse } from "../lib/useHeaderCollapse";

interface CollapsingHeaderProps {
  /** The scroll area this header sits over. Bound here, used by the view for
   *  restoring where the reader was. `RefObject<HTMLDivElement>` rather than a
   *  nullable one, because `ref` is covariant in its element and a nullable
   *  argument is then not a `RefObject<HTMLDivElement>`; the ref a caller makes
   *  with `useRef<HTMLDivElement | null>(null)` still fits. */
  scrollerRef: RefObject<HTMLDivElement>;
  /** The row that goes away: title, actions and filter chips. */
  header: ReactNode;
  /** Forwarded to the scroller, for remembering where the reader was. */
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** The list itself. */
  children: ReactNode;
}

/**
 * A tab header the scroll switches on and off: taken away once the reader is
 * reading down, and put back by the first deliberate movement the other way.
 * It is only ever fully there or fully away, never parked in between.
 *
 * **The scroll is never moved by the header.** The header floats over the list
 * and the list is the full height of the screen whether the header is there or
 * not, so the only thing the flip changes is how much of the list the header is
 * covering. Nothing reflows, nothing is clamped, and a finger on the list moves
 * it by exactly as much as the finger moved.
 *
 * It did not always. The header used to hand its height to the list and take it
 * back, which is the reclaim it was written for, and every flip therefore moved
 * the list by a header on top of whatever the reader was doing: away on the way
 * out, back on the way in, and near the end of a list the browser added a clamp
 * of its own on top of that. Reclaiming space cannot be done without moving the
 * content, so the reclaim is what went.
 *
 * What it costs is that the list runs under the header rather than starting
 * below it, so the header needs a ground of its own to hide what passes
 * underneath (`bg-surface-sunken`, the app's own background, as `CatalogView`'s
 * sticky header already does). The list opens clear of it either way: the
 * content starts a header's height down, and the top of a list always shows its
 * header, so that space is never empty.
 *
 * The height is measured rather than assumed. This row is taller when there are
 * filter chips in it, and it changes height while the screen is open.
 */
export function CollapsingHeader({
  scrollerRef,
  header,
  onScroll,
  children
}: CollapsingHeaderProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setHeight(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const offset = useHeaderCollapse(scrollerRef, height);

  return (
    <div className="relative -mx-3 min-h-0 flex-1 overflow-hidden sm:-mx-6">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        {/* The list starts below the header rather than under it, so nothing
            is hidden at the top of the list. */}
        <div style={{ height }} aria-hidden="true" />
        {children}
      </div>

      {/* Measured on this box rather than on an inner one. It is positioned, so
          it contains the margins of the rows inside it, and an inner box would
          let the last of those escape and leave the list a margin short. */}
      <div
        ref={rowRef}
        className="collapsing-header absolute inset-x-0 top-0 bg-surface-sunken px-3 sm:px-6"
        style={{ transform: `translateY(${-offset}px)` }}
      >
        {header}
      </div>
    </div>
  );
}
