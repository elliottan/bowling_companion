import { useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press detection for pointer devices. `bind(cb)` returns handlers to
 * spread onto an element: `cb` fires after a 500 ms hold (with a small haptic
 * tick where supported) and receives the pressed element. The press cancels if
 * the pointer moves more than 10 px, so scrolling a chip row never triggers
 * it, or on pointer up/cancel. The iOS context menu is suppressed while
 * pressing, and callers must check `didLongPress()` at the top of the
 * element's onClick to swallow the click that follows a fired press.
 */
export function useLongPress() {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const pressing = useRef(false);

  function cancel() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
    pressing.current = false;
  }

  function bind(onLongPress: (target: HTMLElement) => void) {
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        const target = e.currentTarget;
        fired.current = false;
        pressing.current = true;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          cancel();
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress(target);
        }, HOLD_MS);
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        if (!start.current) return;
        const dist = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
        if (dist > MOVE_TOLERANCE_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(e: ReactMouseEvent<HTMLElement>) {
        if (pressing.current || fired.current) e.preventDefault();
      }
    };
  }

  /** True exactly once after a fired long-press, check first in onClick. */
  function didLongPress() {
    const wasFired = fired.current;
    fired.current = false;
    return wasFired;
  }

  return { bind, didLongPress };
}
