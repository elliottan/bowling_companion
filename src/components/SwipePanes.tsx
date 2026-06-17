import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const THRESHOLD = 50; // px of horizontal travel needed to commit a switch
const AXIS_LOCK = 8; // px before we decide the gesture is horizontal vs vertical

/**
 * Renders the active pane out of `panes` and lets the user swipe between them.
 * The pane tracks the finger during the drag (so it feels responsive, not just
 * snap-on-release) and slides the next pane in on commit. Vertical drags are
 * ignored so page scrolling still works. Only the active pane is mounted, so a
 * tall list never inflates the height of a shorter sibling pane.
 */
export function SwipePanes({
  index,
  onIndexChange,
  panes,
  className
}: {
  index: number;
  onIndexChange: (i: number) => void;
  panes: ReactNode[];
  className?: string;
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current === null && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current !== "h") return;
    // Rubber-band at the ends so an out-of-bounds swipe still gives feedback.
    const atEnd = (index === 0 && dx > 0) || (index === panes.length - 1 && dx < 0);
    setDragging(true);
    setDrag(atEnd ? dx * 0.3 : dx);
  }

  function onTouchEnd() {
    const committed = axis.current === "h" && Math.abs(drag) >= THRESHOLD;
    const goNext = committed && drag < 0 && index < panes.length - 1;
    const goPrev = committed && drag > 0 && index > 0;
    startX.current = null;
    startY.current = null;
    axis.current = null;
    setDragging(false);
    setDrag(0); // snaps back via transition, or resets under the incoming pane
    if (goNext) {
      setDir(1);
      onIndexChange(index + 1);
    } else if (goPrev) {
      setDir(-1);
      onIndexChange(index - 1);
    }
  }

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Keyed wrapper replays the slide-in animation each time the pane swaps. */}
      <div key={index} className={dir === 1 ? "pane-in-right" : "pane-in-left"}>
        <div
          style={{
            transform: `translateX(${drag}px)`,
            transition: dragging ? "none" : "transform 0.26s ease-out"
          }}
        >
          {panes[index]}
        </div>
      </div>
    </div>
  );
}
