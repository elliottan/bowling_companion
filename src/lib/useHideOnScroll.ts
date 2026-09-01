import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * How far down the reader has to be before the header is allowed to leave. Above
 * this the header always shows: at the top of a list there is nothing to gain by
 * hiding it, and a header that flickers on the first few pixels of a rubber-band
 * reads as a fault.
 */
const REVEAL_ABOVE = 24;

/**
 * Movement required before the header changes its mind, in pixels. Without it
 * the one-pixel jitter of a momentum scroll flips the header back and forth all
 * the way down the list.
 */
const DELTA = 6;

/**
 * The rule on its own, so it can be read and tested without a scroll container:
 * scrolling down hides the header, scrolling up brings it back, and the top of
 * the list always shows it.
 */
export function nextHidden(hidden: boolean, top: number, lastTop: number): boolean {
  if (top <= REVEAL_ABOVE) return false;
  if (top > lastTop + DELTA) return true;
  if (top < lastTop - DELTA) return false;
  return hidden;
}

/**
 * Whether a scroller's header should be out of the way.
 *
 * Stats and History both spend their header row on a title and two icons, and
 * the filter chips underneath spend another. On a 390x844 phone that is most of
 * a stat card's worth of screen held permanently by chrome the reader has
 * already read. Reading down gives it back; reaching for the filters brings it
 * straight back.
 *
 * The reader's own scrolling is the signal, so nothing has to be tapped and the
 * controls are never more than a short scroll up away.
 */
export function useHideOnScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);
  const lastTop = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    lastTop.current = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      // The previous position is read into a local before the updater is
      // handed over. React may run that updater after this handler returns, and
      // reading the ref inside it would then compare the new position against
      // itself and never decide anything.
      const previous = lastTop.current;
      lastTop.current = top;
      setHidden((was) => nextHidden(was, top, previous));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return hidden;
}
