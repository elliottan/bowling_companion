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
  return Math.max(0, Math.min(scrollRange(el), el.scrollTop));
}

/** How far this scroller can actually travel. */
export function scrollRange(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
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
  room: Room = UNMEASURED,
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
  if (travel >= threshold && !state.collapsed) {
    return worthLeaving(top, room) ? { collapsed: true, travel: 0 } : { collapsed: false, travel };
  }
  if (travel <= -threshold && state.collapsed) return { collapsed: false, travel: 0 };

  return { collapsed: state.collapsed, travel };
}

/** What the scroller has to work with: how far it can travel, and the height
 *  the header would hand it by leaving. */
export interface Room {
  range: number;
  header: number;
}

/** Before the header has been measured there is nothing to weigh, so a flip is
 *  never refused on a list that has not been sized yet. */
export const UNMEASURED: Room = { range: Number.POSITIVE_INFINITY, header: 0 };

/**
 * Whether taking the header away is worth what it costs the reader.
 *
 * The header leaving hands its height to the list, so there is a header less to
 * scroll afterwards. On a long list that is the whole point and costs nothing.
 * On a short one it is worse than nothing twice over: the reader is often past
 * the shortened end already, so the browser pulls the content back to it and
 * the list lurches further than the finger asked for, and what they bought for
 * that lurch is a few pixels of list.
 *
 * A filtered History is exactly this list. The chips make the header nearly
 * twice as tall, and the filter is there to leave fewer sessions in it.
 *
 * So the header only goes if the reader keeps a header's worth of list to
 * travel afterwards, and if where they are now is still somewhere they can be
 * when it is gone. Otherwise it stays, which on a list this short costs them
 * nothing they can see.
 */
export function worthLeaving(top: number, { range, header }: Room): boolean {
  const left = range - header;
  return left >= header && left >= top;
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
      //
      // The baseline is capped to the range, because a header going away hands
      // its height to the scroller, and near the bottom of a short list that
      // leaves less to scroll than there was. The browser pulls `scrollTop`
      // back to the new end, which is not the reader moving. Read as one, it
      // is a move upward of exactly a header's height, which brings the header
      // back, which takes the height away again: the row oscillates for as
      // long as the reader stays near the end.
      const range = scrollRange(el);
      const previous = Math.min(lastTop.current, range);
      lastTop.current = top;
      setState((was) => nextCollapse(was, top, previous, { range, header: max }));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // `max` is read on every scroll, so the listener has to be rebound when the
    // row changes height. Chips appearing is exactly the case this weighs.
  }, [scrollerRef, max]);

  return state.collapsed ? max : 0;
}
