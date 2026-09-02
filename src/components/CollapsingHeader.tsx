import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useHeaderCollapse } from "../lib/useHeaderCollapse";

interface CollapsingHeaderProps {
  /** The scroller whose movement pulls this header up. */
  scrollerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * A tab header the scroll switches on and off: taken away once the reader is
 * reading down, and put back by the first deliberate movement the other way.
 * It is only ever fully there or fully away, never parked in between.
 *
 * It gives the space back rather than sliding over the content, so the wrapper
 * loses exactly the height the header gains in offset. Both are transitioned
 * together (`.collapsing-header` in `index.css`), because the scroll now only
 * decides *when* the header flips: without a transition of its own the row
 * would jump its whole height on one frame, which §7 does not allow.
 *
 * The height is measured rather than assumed. This row is taller when there are
 * filter chips in it, and it changes height while the screen is open.
 */
export function CollapsingHeader({ scrollerRef, children }: CollapsingHeaderProps) {
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

  return (
    <div
      className="collapsing-header overflow-hidden"
      // Until the row has been measured it sizes itself, so the header is on
      // screen for the first paint rather than collapsed to nothing.
      style={height ? { height: height - offset } : undefined}
    >
      <div ref={innerRef} style={{ transform: `translateY(${-offset}px)` }}>
        {children}
      </div>
    </div>
  );
}
