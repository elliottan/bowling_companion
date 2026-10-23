import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerPushExit } from "../lib/backGesture";
import { overlayHandoff, PUSH_IN_MS } from "../lib/overlayHandoff";
import { useOverlay } from "../lib/useOverlay";
import { IconButton } from "./ui/IconButton";

interface PushScreenProps {
  title: string;
  onBack: () => void;
  /** A second line under the title, smaller, for what the title alone does
   *  not say: a session's date and games under its alley. */
  subtitle?: string;
  /** Optional trailing nav-bar action (kept to one control, iOS style). */
  trailing?: ReactNode;
  /**
   * The screen's own bar, from the back control to the trailing edge, in place
   * of the centred title and `trailing`. For a screen whose bar carries more
   * than its name: a session's identity, its score and the actions on it.
   * `title` still names the screen to a screen reader.
   */
  bar?: ReactNode;
  /** Suppress Escape / focus trap while a dialog is layered on top. */
  active?: boolean;
  /**
   * `overlay` (default) floats above the whole app, tab bar included, for a
   * screen reachable from several places (the arsenal). `inline` fills the
   * scroll area of the tab it was pushed from, so the tab bar stays put, which
   * is what a push *within* a tab does natively.
   */
  mode?: "overlay" | "inline";
  /**
   * Put this screen on the sheet back stack, so the platform's back closes it
   * before whatever is underneath. Off by default because a push is normally a
   * route, and history already closes those (ADR-041). On for a push that is
   * *not* a route: one opened from inside a sheet, where back would otherwise
   * pop the sheet's own history entry and close the sheet under it.
   */
  backCloses?: boolean;
  /** Called as the screen starts its exit, before `onBack`. For a layer the
   *  screen owns that lives outside it (a portalled sheet) to leave with it,
   *  rather than sitting on until the route change unmounts it. */
  onLeave?: () => void;
  /**
   * `top` opens the screen above every sheet and the lane view, portalled to
   * the body, for a screen a sheet opens and closes back to: the Pro page,
   * which a lock inside a sheet opens (ADR-175). Pushed in the shell, it slid
   * in under the sheet that opened it.
   */
  layer?: "shell" | "top";
  /**
   * A bar pinned to the bottom of the screen, outside the scroll area, for an
   * action that stays in reach while the page scrolls (the Pro page's button).
   * It pays the bottom safe-area inset itself, so the scroll area drops its
   * own. A `sticky bottom-0` row inside the page stopped above that padding on
   * the iPhone, and the page showed through the gap beneath it.
   */
  footer?: ReactNode;
  children: ReactNode;
}

// Matches the push-screen-in keyframe, so in and out feel like one motion.
const EXIT_MS = 280;

/**
 * Full-screen navigation push: slides in from the trailing edge over whatever
 * launched it and carries a nav bar, which the screen scrolls under, with a
 * leading back control. This is the app's stand-in for a navigation stack, a
 * bottom sheet reads as "a task on top of this screen", which is wrong for a
 * destination the user navigates *into*.
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
  subtitle,
  onBack,
  trailing,
  bar,
  active = true,
  mode = "overlay",
  backCloses = false,
  onLeave,
  layer = "shell",
  footer,
  children,
}: PushScreenProps) {
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);
  // Taking the place of a loading screen part-way through its slide: carry
  // the slide on from where it had got to, by starting the same animation that
  // far in. Past its end, nothing is left to slide.
  const [slideFrom] = useState(() =>
    overlayHandoff.active ? Math.max(0, performance.now() - overlayHandoff.since) : 0
  );
  const takesPlace = overlayHandoff.active && slideFrom >= PUSH_IN_MS;

  // Slide the screen back out before unmounting it. Without this the push
  // animated in and then vanished on a frame, which reads as a page swap
  // rather than a pop, the asymmetry was the whole complaint.
  const dismiss = useCallback(() => {
    if (exitTimer.current !== null) return;
    onLeave?.();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onBack();
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(onBack, EXIT_MS);
  }, [onBack, onLeave]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  // Inline pushes are not modal, the tab bar behind them stays live, so they
  // must not trap focus or swallow Escape.
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, active && mode === "overlay", backCloses);

  // The iPhone app's edge swipe moves the screen with the finger, then leaves
  // through the same slide as the chevron.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => registerPushExit(() => dismissRef.current(), () => overlayRef.current), [overlayRef]);

  const overlay = mode === "overlay";

  const screen = (
    <div
      // Inline pushes position against the tab's own stage (a `relative` box
      // supplied by the caller), so whatever the tab renders underneath stays
      // visible while this screen slides out.
      //
      // An overlay is `fixed`, except as a direct child of the shell, where it
      // is `absolute` against the shell instead. The shell is itself `fixed
      // inset-0`, so the box is the same, but a fixed layer nested in another
      // drifts from it once iOS pinch-zooms the page: a zoomed guide showed
      // the screen underneath below its last line. Positioned against the
      // shell, it is painted as part of the shell and moves with it. A push
      // opened inside a sheet stays `fixed`, to keep its place in that stack.
      //
      // On the top layer it is a body-level layer of its own, above the sheets
      // (z-60) and the lane view (z-70) and under the dialogs (z-80).
      className={
        layer === "top"
          ? "fixed inset-0 z-[75] pointer-events-auto"
          : overlay
            ? "fixed inset-0 z-[55] pointer-events-auto [#app-shell>&]:absolute"
            : "absolute inset-0 z-[5] pointer-events-auto"
      }
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
          exiting || takesPlace ? "" : "animate-push-in"
        }`}
        style={{
          transform: exiting ? "translateX(100%)" : undefined,
          transition: `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          animationDelay: slideFrom > 0 && !takesPlace ? `-${Math.round(slideFrom)}ms` : undefined,
        }}
      >
        {/* The bar floats over the screen and the screen scrolls under it,
            as an iOS navigation bar does (ADR-168). Its title stays, wherever
            the page is, so the bowler always knows where they are (ADR-198).
            Behind it is the floating headers' ground, the page's own colour
            nearly solid over a blur, so a page passing under the title is a
            soft shape rather than words over words, and over the empty top of
            the page it is the page's colour and shows nothing. Safe-area
            insets only in overlay mode, inline sits inside the app shell,
            which has already paid them. */}
        <header
          className={`absolute inset-x-0 top-0 z-20 ${overlay ? "pt-[env(safe-area-inset-top)]" : ""}`}
        >
          <div aria-hidden="true" className="floating-header-ground absolute inset-x-0 -bottom-3 top-0" />
          <div className="relative mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-2 sm:px-4">
            <IconButton label="Back" onClick={dismiss} variant="round">
              {/* Optically centred: the chevron's mass sits right of its box. */}
              <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" className="-ml-0.5" />
            </IconButton>
            {bar ? (
              <div className="ml-1 flex min-w-0 flex-1 items-center gap-1">{bar}</div>
            ) : (
              <>
                <div className="pointer-events-none absolute left-1/2 max-w-[calc(100%-7rem)] -translate-x-1/2 text-center">
                  <h1 className="truncate text-[17px] font-semibold leading-tight text-ink">{title}</h1>
                  {subtitle && <p className="truncate text-xs leading-tight text-ink-secondary">{subtitle}</p>}
                </div>
                <div className="ml-auto flex shrink-0 items-center">{trailing}</div>
              </>
            )}
          </div>
        </header>

        {/* Starts a bar's height down, so the top of the screen is clear of
            the bar until it is scrolled under. `--push-bar-h` is that height,
            for a sticky row inside to stop beneath the bar rather than under
            it. */}
        <div
          className={`ios-bounce min-h-0 flex-1 overflow-y-auto overscroll-contain pt-[var(--push-bar-h)] ${
            // Inline, a Settings section, runs under the tab bar like its tab.
            // A footer pays the bottom inset in place of the scroll area.
            footer ? "" : overlay ? "pb-[env(safe-area-inset-bottom)]" : "pb-[var(--tab-clear,0px)]"
          }`}
          style={{ "--push-bar-h": overlay ? "calc(env(safe-area-inset-top) + 3rem)" : "3rem" } as CSSProperties}
        >
          {children}
        </div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
  return layer === "top" ? createPortal(screen, document.body) : screen;
}
