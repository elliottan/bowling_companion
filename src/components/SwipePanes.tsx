import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const THRESHOLD = 50; // px of horizontal travel needed to commit a switch
const AXIS_LOCK = 12; // px before we decide the gesture is horizontal vs vertical

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
  className
}: {
  index: number;
  onIndexChange: (i: number) => void;
  panes: ReactNode[];
  className?: string;
}) {
  const n = panes.length;
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

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
      className={`overflow-clip ${className ?? ""}`}
      style={{ touchAction: "pan-y" }}
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
