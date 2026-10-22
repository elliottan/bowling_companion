import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject, UIEvent } from "react";

interface FloatingHeaderProps {
  /** The scroll area this header sits over. Bound here, used by the view for
   *  restoring where the reader was. `RefObject<HTMLDivElement>` rather than a
   *  nullable one, because `ref` is covariant in its element and a nullable
   *  argument is then not a `RefObject<HTMLDivElement>`; the ref a caller makes
   *  with `useRef<HTMLDivElement | null>(null)` still fits. */
  scrollerRef: RefObject<HTMLDivElement>;
  /** The row that stays: title, actions and filter chips. */
  header: ReactNode;
  /** Forwarded to the scroller, for remembering where the reader was. */
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** The list itself. */
  children: ReactNode;
}

/**
 * A tab's header that stays where it is while the list scrolls under it, as an
 * iOS large-title screen's bar does once it has collapsed: the title, the
 * actions and the filters are always a tap away, and the list passes beneath
 * them behind a frosted wash that fades out at the header's foot
 * (`.floating-header-ground`), never at a hard edge (ADR-185).
 *
 * It used to slide away as the reader scrolled down and come back on a
 * scroll up. That hid the filters exactly when a long list needed them, and a
 * header that moves on its own under a moving list read as the page jumping.
 *
 * The box reaches up under the status bar, so the list passes under the clock
 * as well as under the header, and the header pads itself back down by the
 * same safe area. The list starts a header's height down, so its top is never
 * hidden; the height is measured, because filter chips make the row taller and
 * they come and go while the screen is open.
 */
export function FloatingHeader({ scrollerRef, header, onScroll, children }: FloatingHeaderProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setHeight(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="relative -mx-3 min-h-0 flex-1 overflow-hidden sm:-mx-6"
      // Up under the status bar. Inline, because Tailwind cannot negate an
      // env() value: `-mt-[env(...)]` builds no rule at all, silently.
      style={{ marginTop: "calc(-1 * env(safe-area-inset-top))" }}
    >
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        // Ends clear of the tab bar on a tab, which `<main>` says through
        // `--tab-clear`; nothing anywhere else (ADR-171).
        className="h-full overflow-y-auto overscroll-contain pb-[var(--tab-clear,0px)]"
      >
        <div style={{ height }} aria-hidden="true" />
        {children}
      </div>

      {/* Measured on this box rather than on an inner one. It is positioned, so
          it contains the margins of the rows inside it, and an inner box would
          let the last of those escape and leave the list a margin short. */}
      <div
        ref={rowRef}
        data-floating-header=""
        className="absolute inset-x-0 top-0 z-[1] px-3 pt-[env(safe-area-inset-top)] sm:px-6"
      >
        <div aria-hidden="true" className="floating-header-ground absolute inset-x-0 -bottom-5 top-0" />
        <div className="relative">{header}</div>
      </div>
    </div>
  );
}
