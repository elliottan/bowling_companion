import { ChevronLeft } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useOverlay } from "../lib/useOverlay";

interface PushScreenProps {
  title: string;
  /** Label next to the back chevron — the place the user came from. */
  backLabel?: string;
  onBack: () => void;
  /** Optional trailing nav-bar action (kept to one control, iOS style). */
  trailing?: ReactNode;
  /** Suppress Escape / focus trap while a dialog is layered on top. */
  active?: boolean;
  children: ReactNode;
}

// A drag that starts this far from the leading edge is a back gesture, not a
// scroll — matches the iOS screen-edge pan recogniser's width.
const EDGE_ZONE_PX = 28;
const DISMISS_PX = 90;

/**
 * Full-screen navigation push: slides in from the trailing edge over whatever
 * launched it, carries a sticky nav bar with a leading back control, and can be
 * dismissed by dragging from the leading edge. This is the app's stand-in for a
 * navigation stack — a bottom sheet reads as "a task on top of this screen",
 * which is wrong for a destination the user navigates *into*.
 */
export function PushScreen({
  title,
  backLabel = "Back",
  onBack,
  trailing,
  active = true,
  children,
}: PushScreenProps) {
  const [dragX, setDragX] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const overlayRef = useOverlay<HTMLDivElement>(onBack, active);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    if (x > EDGE_ZONE_PX) return;
    dragStartX.current = e.clientX;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragStartX.current === null) return;
    setDragX(Math.max(0, e.clientX - dragStartX.current));
  }

  function endDrag() {
    if (dragStartX.current !== null && dragX > DISMISS_PX) onBack();
    dragStartX.current = null;
    setDragX(0);
  }

  const dragging = dragStartX.current !== null;

  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label={title}>
      {/* The screen underneath stays visible at the edge of a back-drag, which
          is what makes the gesture read as "peeling this screen off". */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" style={{ opacity: dragX > 0 ? 0.6 : 1 }} />
      <div
        ref={overlayRef}
        className={`absolute inset-0 flex flex-col bg-surface-sunken ${dragX === 0 && !dragging ? "animate-push-in" : ""}`}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <header className="shrink-0 border-b border-edge bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="relative mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-1 sm:px-4">
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 inline-flex h-11 shrink-0 items-center gap-0.5 rounded-lg pl-1 pr-2 text-[17px] font-medium text-accent active:opacity-60"
            >
              <ChevronLeft size={26} strokeWidth={2.25} aria-hidden="true" />
              {backLabel}
            </button>
            <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 truncate text-[17px] font-semibold text-ink">
              {title}
            </h1>
            <div className="ml-auto flex shrink-0 items-center">{trailing}</div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>
  );
}
