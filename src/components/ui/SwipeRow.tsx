import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "../../lib/haptics";

/** How wide the revealed action is, and how far a row rests open. */
const ACTION_W = 88;
/** Sideways before the row takes the finger, and by how much more than
 *  downward: a scroll that drifts a little sideways stays a scroll. */
const SLOP_PX = 10;
const SIDEWAYS_RATIO = 1.3;
/** A lift moving left this fast opens the row however short the swipe. */
const FLICK_PX_PER_MS = 0.45;

// The one row open at a time, as in a UIKit table: opening a row, or touching
// anywhere else, closes the open one.
let closeOpenRow: (() => void) | null = null;

interface SwipeRowProps {
  /** What the action does, spoken and shown: "Delete". */
  actionLabel: string;
  /** Asks, never acts: every caller opens its confirm from here (ADR-233). */
  onAction: () => void;
  /** No swipe at all, for a row that cannot be deleted from here. */
  disabled?: boolean;
  /** The row's own corners, so the revealed action is clipped to them. */
  className?: string;
  children: ReactNode;
}

/**
 * A list row with a trailing swipe action, as a UIKit table's: swipe left and
 * the row slides aside to show a red Delete behind it, which rests open until
 * it is tapped or anything else is touched (ADR-233).
 *
 * It only ever opens. There is no full swipe that acts on its own, and the
 * action it shows only asks: the caller raises its `ConfirmDialog` (the
 * phone's own alert in the iPhone app), so nothing is deleted by a thumb that
 * slipped. A swipe that is mostly downward is the list's scroll, never this.
 */
export function SwipeRow({ actionLabel, onAction, disabled = false, className = "", children }: SwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    base: number;
    mode: "pending" | "drag" | "scroll";
    lastX: number;
    lastT: number;
    v: number;
  } | null>(null);
  // A drag, or a tap that closed the row, swallows the click that follows it,
  // so the row underneath does not open.
  const swallowClick = useRef(false);
  const open = offset < 0 && !dragging;

  const close = () => setOffset(0);

  // While open: a touch anywhere else closes it (and goes no further, as in
  // UIKit), a scroll closes it, and opening another row closes it.
  useEffect(() => {
    if (!open) return;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      close();
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      // A touch that turns into a scroll fires no click; drop the trap then.
      window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 600);
    };
    const onScroll = () => close();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("scroll", onScroll, true);
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [open]);

  if (disabled) return <div className={className}>{children}</div>;

  const settle = (to: number) => {
    setDragging(false);
    setOffset(to);
  };

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      {/* The action, behind the row's trailing edge. It widens with a swipe
          past its width, as UIKit's does, but acting stays a tap. Out of the
          tab order and the accessibility tree while closed: the row's own
          destination keeps the delete that a screen reader reaches. */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(ACTION_W, -offset) }} aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            close();
            onAction();
          }}
          className="flex w-full flex-col items-center justify-center gap-0.5 bg-danger-600 text-caption font-semibold text-white active:opacity-80"
        >
          <Trash2 size={20} aria-hidden="true" />
          {actionLabel}
        </button>
      </div>
      <div
        className="relative touch-pan-y"
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)"
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          // A control that drags on its own (the arsenal's reorder handle).
          if ((e.target as HTMLElement).closest("[data-swipe-ignore]")) return;
          gesture.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            base: offset,
            mode: "pending",
            lastX: e.clientX,
            lastT: performance.now(),
            v: 0
          };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (g.mode === "pending") {
            if (Math.abs(dy) > SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
              g.mode = "scroll";
              return;
            }
            // Rightward only reaches an open row: a closed one has nothing to
            // the left, and the iPhone's back swipe starts there.
            if (Math.abs(dx) < SLOP_PX || Math.abs(dx) < Math.abs(dy) * SIDEWAYS_RATIO) return;
            if (dx > 0 && g.base === 0) {
              g.mode = "scroll";
              return;
            }
            g.mode = "drag";
            setDragging(true);
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }
          if (g.mode !== "drag") return;
          const now = performance.now();
          if (now > g.lastT) g.v = (e.clientX - g.lastX) / (now - g.lastT);
          g.lastX = e.clientX;
          g.lastT = now;
          let next = g.base + dx;
          // Past the action's width it gives, and stops; right of rest, a
          // little, and stops.
          if (next < -ACTION_W) next = -ACTION_W - Math.min(80, Math.sqrt(-ACTION_W - next) * 5);
          if (next > 0) next = Math.min(12, Math.sqrt(next) * 2);
          if ((offset > -ACTION_W / 2) !== (next > -ACTION_W / 2)) void haptic("select");
          setOffset(next);
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          gesture.current = null;
          if (!g || g.id !== e.pointerId || g.mode !== "drag") return;
          swallowClick.current = true;
          // A drag that ends off the row fires no click; never swallow a later tap.
          window.setTimeout(() => (swallowClick.current = false), 400);
          const stale = performance.now() - g.lastT > 80;
          const flickLeft = !stale && g.v < -FLICK_PX_PER_MS;
          const flickRight = !stale && g.v > FLICK_PX_PER_MS;
          settle(!flickRight && (flickLeft || offset < -ACTION_W / 2) ? -ACTION_W : 0);
        }}
        onPointerCancel={() => {
          const g = gesture.current;
          gesture.current = null;
          if (g?.mode === "drag") settle(g.base);
        }}
        onClickCapture={(e) => {
          // After a drag, or on a row resting open: the tap closes it and
          // opens nothing.
          if (swallowClick.current) {
            // The click a drag fires as it ends: it opens nothing, and leaves
            // the row where the drag left it.
            swallowClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          } else if (offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
