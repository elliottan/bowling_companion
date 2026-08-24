import { useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { rememberScroll, restoreScroll } from "../lib/viewMemory";

const THRESHOLD = 50; // px of horizontal travel needed to commit a switch
const AXIS_LOCK = 12; // px before we decide the gesture is horizontal vs vertical

/**
 * True when the touch landed inside something that scrolls sideways itself
 * (a leaves row, a wide table). That content owns the gesture: swiping a row
 * of cards is not a request to change tab, and the two together would scroll
 * the row and switch the pane out from under it at the same time.
 */
function inHorizontalScroller(target: EventTarget | null, container: Element | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== container) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Horizontal carousel of panes. All panes are mounted side by side on one
 * track; the active one is shown by translating the track. The finger drags the
 * same track that animates on release, so there's no jump on commit, and each
 * pane scrolls internally (so swapping never changes height or re-runs a pane's
 * mount effects). Vertical drags are left to the pane's own scroll.
 *
 * The parent must give this a fixed height (e.g. flex-1 / h-full) since the
 * panes scroll within it.
 */
export function SwipePanes({
  index,
  onIndexChange,
  panes,
  className,
  scrollKey
}: {
  index: number;
  onIndexChange: (i: number) => void;
  panes: ReactNode[];
  className?: string;
  /** Give each pane a name and its scroll offset is restored when the view is
   *  mounted again, which is what a tab switch does. */
  scrollKey?: string;
}) {
  const n = panes.length;
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const yielded = useRef(false);
  const paneRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Before paint, so a restored offset never shows as a jump from the top.
  useLayoutEffect(() => {
    if (!scrollKey) return;
    const stops = paneRefs.current.map((el, i) =>
      el ? restoreScroll(el, `${scrollKey}:${i}`) : () => {}
    );
    return () => stops.forEach((stop) => stop());
    // Mount only: after this the panes own their own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
    yielded.current = inHorizontalScroller(e.target, trackRef.current);
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null || startY.current === null || yielded.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current === null && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current !== "h") return;
    // Stay put at the ends — no rubber-band.
    const canGo = (dx < 0 && index < n - 1) || (dx > 0 && index > 0);
    setDragging(true);
    setDrag(canGo ? dx : 0);
  }

  function onTouchEnd() {
    const d = drag;
    const horizontal = axis.current === "h";
    startX.current = null;
    startY.current = null;
    axis.current = null;
    setDragging(false);
    setDrag(0); // track eases to the (possibly new) index from where the finger left it
    if (!horizontal || Math.abs(d) < THRESHOLD) return;
    if (d < 0 && index < n - 1) onIndexChange(index + 1);
    else if (d > 0 && index > 0) onIndexChange(index - 1);
  }

  return (
    <div
      // overflow-clip (not hidden): a pane's scrollIntoView must not be able to
      // scroll this container sideways, which would knock the carousel off its
      // translateX track.
      ref={trackRef}
      className={`overflow-clip ${className ?? ""}`}
      // Both axes, not `pan-y`: a pane that holds a sideways-scrolling row
      // needs the browser's own horizontal panning, and `touch-action` is
      // intersected down the ancestor chain, so `pan-y` here would kill it
      // however the row declares itself. The tab gesture yields instead, in
      // `inHorizontalScroller`.
      style={{ touchAction: "pan-x pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex h-full"
        style={{
          width: `${n * 100}%`,
          transform: `translateX(calc(${-index * (100 / n)}% + ${drag}px))`,
          transition: dragging ? "none" : "transform 0.26s ease-out"
        }}
      >
        {panes.map((pane, i) => (
          <div
            key={i}
            ref={(el) => {
              paneRefs.current[i] = el;
            }}
            onScroll={
              scrollKey
                ? (e) => rememberScroll(`${scrollKey}:${i}`, e.currentTarget.scrollTop)
                : undefined
            }
            className="h-full min-h-0 overflow-y-auto overscroll-contain"
            style={{ width: `${100 / n}%` }}
          >
            {pane}
          </div>
        ))}
      </div>
    </div>
  );
}
