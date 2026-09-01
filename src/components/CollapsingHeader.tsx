import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useHeaderCollapse } from "../lib/useHeaderCollapse";

interface CollapsingHeaderProps {
  /** The scroller whose movement pulls this header up. */
  scrollerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * A tab header that moves with the scroll: pulled up as the reader reads down,
 * and returned by the first movement back the other way, pixel for pixel.
 *
 * It gives the space back rather than sliding over the content, so the wrapper
 * loses exactly the height the header gains in offset. Nothing is animated and
 * nothing is transitioned: the scroll *is* the animation, and a transition on
 * top of it would lag the finger by its own duration.
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
      className="overflow-hidden"
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
