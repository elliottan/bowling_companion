import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useHeaderCollapse } from "../lib/useHeaderCollapse";

interface CollapsingHeaderProps {
  /** The scroller whose movement pulls this header up. It must be inside `children`. */
  scrollerRef: RefObject<HTMLElement | null>;
  /** The row that goes away: title, actions and filter chips. */
  header: ReactNode;
  /** The scroll area under it, which travels with the header. */
  children: ReactNode;
}

/**
 * How long the header takes to leave or arrive. It matches the transition on
 * `.collapsing-header` in `index.css`, and is used to know when the slide is
 * over rather than to drive it.
 */
const SLIDE_MS = 400;

/**
 * A tab header the scroll switches on and off: taken away once the reader is
 * reading down, and put back by the first deliberate movement the other way.
 * It is only ever fully there or fully away, never parked in between.
 *
 * The header and the scroll area under it are one rigid block, and the whole
 * block slides. Only `transform` is animated, so the two move as one thing on
 * one pipeline. They used to move as two: the row transitioned its height while
 * its contents transitioned a transform, on the same curve but through
 * different pipelines, and layout cannot keep step with the compositor. Coming
 * back, that read as the list being shoved down past where the header put it.
 *
 * The space is still given back rather than slid over: the block is a header's
 * height taller than the screen while it is up, so the scroll area keeps the
 * height the header let go of. That extra height is only ever added or removed
 * while it is off the bottom edge, which is why it needs no transition of its
 * own and why the block stays tall until the slide finishes.
 *
 * The height is measured rather than assumed. This row is taller when there are
 * filter chips in it, and it changes height while the screen is open.
 */
export function CollapsingHeader({ scrollerRef, header, children }: CollapsingHeaderProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setHeight(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const offset = useHeaderCollapse(scrollerRef, height);

  // The block has to stay tall for the whole arrival, not just while it is up:
  // shortening it on the frame the header starts coming back would take the
  // extra height away while it is still on screen, which is the gap at the
  // bottom of the list this is here to avoid. A timer rather than
  // `transitionend`, because under `prefers-reduced-motion` there is no
  // transition to end.
  const [sliding, setSliding] = useState(false);
  const slidFrom = useRef(offset);
  useEffect(() => {
    // Nothing is sliding on the first render, and claiming otherwise would hang
    // a header's height off the bottom edge for the whole of the first second
    // on screen.
    if (slidFrom.current === offset) return;
    slidFrom.current = offset;
    setSliding(true);
    const id = window.setTimeout(() => setSliding(false), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [offset]);

  const tall = offset > 0 || sliding;

  return (
    <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6">
      <div
        // `shrink-0` so the block keeps the height it is given: it is a flex
        // item, and a flex item that may shrink would give the extra height
        // straight back rather than handing it to the scroller.
        className="collapsing-header flex min-h-0 shrink-0 flex-col"
        style={{
          height: tall && height ? `calc(100% + ${height}px)` : "100%",
          transform: `translateY(${-offset}px)`
        }}
      >
        <div ref={innerRef} className="px-3 sm:px-6">
          {header}
        </div>
        {children}
      </div>
    </div>
  );
}
