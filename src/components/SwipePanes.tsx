import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const THRESHOLD = 50;

/**
 * Renders the active pane out of `panes` and animates it sliding in from the
 * swipe direction when `index` changes. A left swipe advances, a right swipe
 * goes back; vertical drags are ignored so they don't fight page scrolling.
 * Only the active pane is mounted, so a tall list never inflates the height of a
 * shorter sibling pane.
 */
export function SwipePanes({
  index,
  onIndexChange,
  panes
}: {
  index: number;
  onIndexChange: (i: number) => void;
  panes: ReactNode[];
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    startX.current = null;
    startY.current = null;
    // Only a deliberate, mostly-horizontal swipe switches panes.
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0 && index < panes.length - 1) {
      setDir(1);
      onIndexChange(index + 1);
    } else if (dx > 0 && index > 0) {
      setDir(-1);
      onIndexChange(index - 1);
    }
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div key={index} className={dir === 1 ? "pane-in-right" : "pane-in-left"}>
        {panes[index]}
      </div>
    </div>
  );
}
