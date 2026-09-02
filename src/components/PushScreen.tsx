import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useOverlay } from "../lib/useOverlay";
import { IconButton } from "./ui/IconButton";

interface PushScreenProps {
  title: string;
  onBack: () => void;
  /** Optional trailing nav-bar action (kept to one control, iOS style). */
  trailing?: ReactNode;
  /** Suppress Escape / focus trap while a dialog is layered on top. */
  active?: boolean;
  /**
   * `overlay` (default) floats above the whole app, tab bar included, for a
   * screen reachable from several places (the arsenal). `inline` fills the
   * scroll area of the tab it was pushed from, so the tab bar stays put, which
   * is what a push *within* a tab does natively.
   */
  mode?: "overlay" | "inline";
  children: ReactNode;
}

// Matches the push-screen-in keyframe, so in and out feel like one motion.
const EXIT_MS = 280;

/**
 * Full-screen navigation push: slides in from the trailing edge over whatever
 * launched it and carries a sticky nav bar with a leading back control. This is
 * the app's stand-in for a navigation stack, a bottom sheet reads as "a task
 * on top of this screen", which is wrong for a destination the user navigates
 * *into*.
 *
 * Back out of it with the chevron or with the platform's own back: Android's
 * button, iOS's left-edge swipe. This used to carry an edge-drag of its own,
 * from a time when an installed iOS PWA had no swipe of its own (ADR-041). iOS
 * added one, and then both ran on the same gesture: the OS slid a snapshot of
 * the previous entry in from the left while this slid a live screen right, and
 * the user saw the screen underneath twice. An imitation of a platform gesture
 * cannot win against the platform's own, so it is gone (ADR-065).
 */
export function PushScreen({
  title,
  onBack,
  trailing,
  active = true,
  mode = "overlay",
  children,
}: PushScreenProps) {
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);

  // Slide the screen back out before unmounting it. Without this the push
  // animated in and then vanished on a frame, which reads as a page swap
  // rather than a pop, the asymmetry was the whole complaint.
  const dismiss = useCallback(() => {
    if (exitTimer.current !== null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onBack();
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(onBack, EXIT_MS);
  }, [onBack]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  // Inline pushes are not modal, the tab bar behind them stays live, so they
  // must not trap focus or swallow Escape.
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, active && mode === "overlay", false);

  const overlay = mode === "overlay";

  return (
    <div
      // Inline pushes position against the tab's own stage (a `relative` box
      // supplied by the caller), so whatever the tab renders underneath stays
      // visible while this screen slides out.
      className="absolute inset-0 z-[5] pointer-events-auto"
      style={overlay ? { position: "fixed", zIndex: 55 } : undefined}
      role={overlay ? "dialog" : "region"}
      aria-modal={overlay || undefined}
      aria-label={title}
    >
      {/* Dims what is underneath, and fades with the exit so the screen behind
          arrives at full strength as this one leaves. */}
      {overlay && (
        <div
          className="absolute inset-0 bg-black/30 transition-opacity duration-200"
          aria-hidden="true"
          style={{ opacity: exiting ? 0 : 1 }}
        />
      )}
      <div
        ref={overlayRef}
        className={`absolute inset-0 flex flex-col bg-surface-sunken ${
          exiting ? "" : "animate-push-in"
        }`}
        style={{
          transform: exiting ? "translateX(100%)" : undefined,
          transition: `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        {/* Safe-area insets only in overlay mode, inline sits inside the app
            shell, which has already paid them. */}
        <header
          className={`shrink-0 border-b border-edge bg-surface ${
            overlay ? "pt-[env(safe-area-inset-top)]" : ""
          }`}
        >
          <div className="relative mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-1 sm:px-4">
            <IconButton label="Back" onClick={dismiss} variant="round">
              {/* Optically centred: the chevron's mass sits right of its box. */}
              <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" className="-ml-0.5" />
            </IconButton>
            <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 truncate text-[17px] font-semibold text-ink">
              {title}
            </h1>
            <div className="ml-auto flex shrink-0 items-center">{trailing}</div>
          </div>
        </header>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
            overlay ? "pb-[env(safe-area-inset-bottom)]" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
