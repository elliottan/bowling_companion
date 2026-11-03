import { useCallback, useEffect, useRef, useState } from "react";

const EXIT_MS = 220;
// A drag this far down commits to closing; anything less springs back.
const DISMISS_PX = 96;
// Or a flick this fast downward (px per ms), however short, as UIKit's sheet
// closes on a flick rather than only past a distance (ADR-229).
const FLICK_PX_PER_MS = 0.5;
// How far a drag upward moves the sheet: past its resting place it gives a
// little and no more, as a system sheet does at its top detent.
function rubberBand(dy: number): number {
  return -Math.min(24, Math.sqrt(-dy) * 2);
}

export interface SheetDismiss {
  /** Close with the exit animation, then run `after` *instead of* `onClose`
   *  (with no argument, it runs `onClose`). Wire every close path through this,
   *  confirm buttons included.
   *
   *  `after` replaces rather than adds, so it has to close the overlay itself.
   *  That is free for a dialog whose confirm handler already clears the state
   *  holding it open, and a trap for anything else: the ball picker passed its
   *  "Manage arsenal" navigation on its own, kept its open state, and slid back
   *  up on top of the screen it had just opened. Compose when in doubt:
   *  `dismiss(() => { onClose(); somethingElse(); })`. */
  dismiss: (after?: () => void) => void;
  /** Style for the overlay's outermost element: stops it taking taps on the
   *  way out, when it is a picture of a sheet rather than a sheet. */
  rootStyle: React.CSSProperties;
  /** Style for the backdrop: fades with the panel. */
  backdropStyle: React.CSSProperties;
  /** Style for the panel itself: slides down out of view (or scales, centered). */
  panelStyle: React.CSSProperties;
  /** True once the exit has started, so callers can drop enter animations. */
  exiting: boolean;
  /** Spread onto a drag handle (bottom sheets only). */
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  /** A callback ref for the sheet's scrolling body (bottom sheets only): a
   *  finger that pulls down while the body is already at its top moves the
   *  sheet rather than the list, as a UIKit sheet does (ADR-229). */
  bodyDragRef: (el: HTMLElement | null) => void;
}

/**
 * Sheets and dialogs enter with an animation and used to leave by simply
 * unmounting, which reads as the screen glitching rather than the sheet
 * leaving. This gives every overlay a symmetric exit, and bottom sheets a
 * drag-down-to-dismiss that follows the finger.
 *
 * `align: "bottom"` slides out downwards; `"center"` fades and settles back.
 */
export function useSheetDismiss(
  onClose: () => void,
  align: "bottom" | "center" = "bottom"
): SheetDismiss {
  const [exiting, setExiting] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  // Whether a finger is down on the drag surface. State, not a read of
  // `dragStartY` during render: the panel's transition is switched off for the
  // drag, and a ref read in render only reflects the drag by luck of the next
  // `setDragY` re-rendering it.
  const [dragging, setDragging] = useState(false);
  const timer = useRef<number | null>(null);
  // The last two positions of a drag, for its speed as the finger lifts.
  const lastMove = useRef<{ y: number; t: number; v: number }>({ y: 0, t: 0, v: 0 });
  const dragYRef = useRef(0);

  const dismiss = useCallback(
    (after?: () => void) => {
      const run = typeof after === "function" ? after : onClose;
      if (timer.current !== null) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        run();
        return;
      }
      setExiting(true);
      // Reset alongside `run` so a dialog that stays mounted while closed (the
      // `open` prop pattern) comes back visible and dismissable next time.
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setExiting(false);
        run();
      }, EXIT_MS);
    },
    [onClose]
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const beginDrag = useCallback((y: number) => {
    dragStartY.current = y;
    setDragging(true);
    lastMove.current = { y, t: performance.now(), v: 0 };
  }, []);
  const moveDrag = useCallback((y: number) => {
    if (dragStartY.current === null) return;
    const now = performance.now();
    const last = lastMove.current;
    const dt = now - last.t;
    if (dt > 0) lastMove.current = { y, t: now, v: (y - last.y) / dt };
    const dy = y - dragStartY.current;
    const next = dy >= 0 ? dy : rubberBand(dy);
    dragYRef.current = next;
    setDragY(next);
  }, []);
  const endDrag = useCallback(
    (cancelled = false) => {
      if (dragStartY.current === null) return;
      // A finger that stopped before lifting has no speed left in it.
      const stale = performance.now() - lastMove.current.t > 80;
      const flicked = !stale && lastMove.current.v > FLICK_PX_PER_MS && dragYRef.current > 0;
      const shouldClose = !cancelled && (dragYRef.current > DISMISS_PX || flicked);
      dragStartY.current = null;
      setDragging(false);
      dragYRef.current = 0;
      setDragY(0);
      if (shouldClose) dismiss();
    },
    [dismiss]
  );

  // The body's pull: touch events rather than pointer events, because the
  // body scrolls natively and a pointer is taken from the page the moment the
  // browser scrolls. Non-passive, so the pull can stop the list from moving
  // under it. A pull only starts at the top, and only downward.
  const bodyCleanup = useRef<(() => void) | null>(null);
  const bodyDragRef = useCallback(
    (el: HTMLElement | null) => {
      bodyCleanup.current?.();
      bodyCleanup.current = null;
      if (!el || align !== "bottom") return;
      let startY: number | null = null;
      let pulling = false;
      const onStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        pulling = false;
      };
      const onMove = (e: TouchEvent) => {
        if (startY === null) return;
        const y = e.touches[0].clientY;
        if (!pulling) {
          if (el.scrollTop > 0 || y - startY <= 4) {
            // Scrolling the list, or pushing up: the list's, for this touch.
            if (el.scrollTop > 0 || y < startY) startY = null;
            return;
          }
          pulling = true;
          beginDrag(y);
        }
        e.preventDefault();
        moveDrag(y);
      };
      const onEnd = () => {
        if (pulling) endDrag();
        startY = null;
        pulling = false;
      };
      const onCancel = () => {
        if (pulling) endDrag(true);
        startY = null;
        pulling = false;
      };
      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchmove", onMove, { passive: false });
      el.addEventListener("touchend", onEnd);
      el.addEventListener("touchcancel", onCancel);
      bodyCleanup.current = () => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchmove", onMove);
        el.removeEventListener("touchend", onEnd);
        el.removeEventListener("touchcancel", onCancel);
      };
    },
    [align, beginDrag, moveDrag, endDrag]
  );

  // The dim lifts as the sheet is pulled down, as UIKit's does, rather than
  // holding full until the sheet lets go.
  const pulled = typeof window === "undefined" ? 0 : Math.max(0, dragY) / Math.max(1, window.innerHeight * 0.75);

  const transform = exiting
    ? align === "bottom"
      ? "translateY(100%)"
      : "scale(0.96)"
    : dragY
      ? `translateY(${dragY}px)`
      : undefined;

  return {
    dismiss,
    exiting,
    // For the overlay's outermost element. An overlay on its way out is a
    // picture, not a surface: it used to keep swallowing taps for the whole
    // exit, so the first tap after closing a sheet went nowhere and the reader
    // tapped again at something that had already moved.
    rootStyle: {
      pointerEvents: exiting ? ("none" as const) : undefined
    },
    backdropStyle: {
      opacity: exiting ? 0 : Math.max(0, 1 - pulled),
      transition: dragging ? "none" : `opacity ${EXIT_MS}ms ease-out`
    },
    panelStyle: {
      transform,
      opacity: exiting && align === "center" ? 0 : undefined,
      transition: dragging ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${EXIT_MS}ms ease-out`
    },
    dragHandlers: {
      onPointerDown: (e) => {
        // A sheet whose whole header is a drag surface still has controls in
        // that header. Capturing the pointer here would swallow their press.
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        beginDrag(e.clientY);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => moveDrag(e.clientY),
      onPointerUp: () => endDrag(),
      onPointerCancel: () => endDrag(true)
    },
    bodyDragRef
  };
}
