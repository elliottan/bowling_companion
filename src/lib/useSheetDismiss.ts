import { useCallback, useEffect, useRef, useState } from "react";

const EXIT_MS = 220;
// A drag this far down commits to closing; anything less springs back.
const DISMISS_PX = 96;

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
  const timer = useRef<number | null>(null);

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

  const dragging = dragStartY.current !== null;

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
      opacity: exiting ? 0 : 1,
      transition: `opacity ${EXIT_MS}ms ease-out`
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
        if ((e.target as HTMLElement).closest("button")) return;
        dragStartY.current = e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        if (dragStartY.current === null) return;
        setDragY(Math.max(0, e.clientY - dragStartY.current));
      },
      onPointerUp: () => {
        const shouldClose = dragY > DISMISS_PX;
        dragStartY.current = null;
        setDragY(0);
        if (shouldClose) dismiss();
      },
      onPointerCancel: () => {
        dragStartY.current = null;
        setDragY(0);
      }
    }
  };
}
