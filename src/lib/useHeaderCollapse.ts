import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * How far the header has been pulled up, given where the scroller was and where
 * it is now.
 *
 * The header moves by exactly what the scroll moved, in both directions, and
 * stops at nothing and at its own height. That one-to-one tie is the whole
 * point: a header that waits for a threshold and then jumps is reacting to the
 * reader, and it reads as a stutter rather than as a surface being moved.
 */
export function nextOffset(offset: number, top: number, lastTop: number, max: number): number {
  const moved = offset + (top - lastTop);
  return Math.max(0, Math.min(max, moved));
}

/**
 * How far a tab header should be pulled up, in pixels, as the reader scrolls.
 *
 * Stats and History both spend a row on a title and two icons, and another on
 * the filter chips. On a 390x844 phone that is most of a stat card's worth of
 * screen held permanently by chrome the reader has already read. Reading down
 * gives it back a pixel at a time; the first movement back up starts returning
 * it, without having to reach the top of the list.
 *
 * `max` is measured rather than assumed, because the row is taller when there
 * are filter chips in it.
 */
export function useHeaderCollapse(
  scrollerRef: RefObject<HTMLElement | null>,
  max: number
): number {
  const [offset, setOffset] = useState(0);
  const lastTop = useRef(0);
  const maxRef = useRef(max);
  maxRef.current = max;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    lastTop.current = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      // Read into a local before the updater is handed over: React may run it
      // after this returns, and reading the ref inside would then measure the
      // new position against itself and never move anything.
      const previous = lastTop.current;
      lastTop.current = top;
      setOffset((was) => nextOffset(was, top, previous, maxRef.current));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollerRef]);

  // A row that shrinks (a filter chip removed) must not leave the header parked
  // further up than it can now go.
  return Math.min(offset, max);
}
