import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Boards of scroll travel, in one direction, before the header flips.
 *
 * It exists so that the flip answers a deliberate movement and not a nudge. Too
 * small and the header flickers on the wobble in a thumb held still; too large
 * and reaching back for the header feels like it is being withheld.
 */
export const COLLAPSE_THRESHOLD = 24;

/**
 * Where the scroller really is, ignoring rubber-band overscroll.
 *
 * iOS lets `scrollTop` run past both ends while a finger drags, then springs it
 * back. That spring is not a scroll: pulling 60px past the top and letting go
 * reports a +60 move, which would flip the header away with no way to get it
 * back, because every attempt to scroll up ends in the same spring. Reading the
 * position clamped to the real range makes the bounce a no-op at both ends.
 */
export function scrollPosition(el: HTMLElement): number {
  const range = Math.max(0, el.scrollHeight - el.clientHeight);
  return Math.max(0, Math.min(range, el.scrollTop));
}

export interface CollapseState {
  /** Whether the header is away. It is only ever fully away or fully there. */
  collapsed: boolean;
  /** Scroll travel accumulated since the reader last changed direction. */
  travel: number;
}

export const INITIAL_COLLAPSE: CollapseState = { collapsed: false, travel: 0 };

/**
 * The header's next state, given where the scroller was and where it is now.
 *
 * The header is a switch, not a slider: the scroll decides *when* it flips, and
 * the header itself decides how it gets there. A header pinned to the scroll
 * pixel for pixel spends most of its life half-there, which is the one state it
 * is no use in, too short to read, too tall to be out of the way.
 *
 * Travel accumulates in whichever direction the reader is going and resets when
 * they turn around, so a flick that changes its mind mid-way does not bank the
 * distance it already covered towards the flip.
 */
export function nextCollapse(
  state: CollapseState,
  top: number,
  lastTop: number,
  threshold = COLLAPSE_THRESHOLD
): CollapseState {
  const delta = top - lastTop;

  // The top of a list always shows its header. Arriving there is the answer on
  // its own: no threshold to clear, and nothing left above to read.
  if (top <= 0) return INITIAL_COLLAPSE;
  if (delta === 0) return state;

  const turned = delta > 0 !== state.travel > 0;
  const travel = turned ? delta : state.travel + delta;

  // A flip resets the travel, so coming back needs a fresh threshold of its
  // own rather than the tail of the movement that just flipped it.
  if (travel >= threshold && !state.collapsed) return { collapsed: true, travel: 0 };
  if (travel <= -threshold && state.collapsed) return { collapsed: false, travel: 0 };

  return { collapsed: state.collapsed, travel };
}

/**
 * How far a tab header should be pulled up, in pixels, as the reader scrolls.
 *
 * Stats and History both spend a row on a title and two icons, and another on
 * the filter chips. On a 390x844 phone that is most of a stat card's worth of
 * screen held permanently by chrome the reader has already read. Reading down
 * gives it back; the first deliberate movement back up returns it, without
 * having to reach the top of the list.
 *
 * The answer is always 0 or `max`. `max` is measured rather than assumed,
 * because the row is taller when there are filter chips in it.
 */
export function useHeaderCollapse(
  scrollerRef: RefObject<HTMLElement | null>,
  max: number
): number {
  const [state, setState] = useState<CollapseState>(INITIAL_COLLAPSE);
  const lastTop = useRef(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    lastTop.current = scrollPosition(el);
    const onScroll = () => {
      const top = scrollPosition(el);
      // Read into a local before the updater is handed over: React may run it
      // after this returns, and reading the ref inside would then measure the
      // new position against itself and never move anything.
      const previous = lastTop.current;
      lastTop.current = top;
      setState((was) => nextCollapse(was, top, previous));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollerRef]);

  return state.collapsed ? max : 0;
}
