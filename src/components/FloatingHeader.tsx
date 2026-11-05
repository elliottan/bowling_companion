import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject, UIEvent } from "react";
import { LARGE_TITLE } from "./ui/typography";

interface FloatingHeaderProps {
  /** The scroll area this header sits over. Bound here, used by the view for
   *  restoring where the reader was. `RefObject<HTMLDivElement>` rather than a
   *  nullable one, because `ref` is covariant in its element and a nullable
   *  argument is then not a `RefObject<HTMLDivElement>`; the ref a caller makes
   *  with `useRef<HTMLDivElement | null>(null)` still fits. */
  scrollerRef: RefObject<HTMLDivElement>;
  /**
   * The tab's name, as iOS's large title (ADR-240): large, leading, part of
   * the page, so it scrolls away with it, and as it goes under the bar the
   * name comes in small and centred there. None on a screen whose own bar
   * already names it (Stats pushed from a session).
   */
  title?: string;
  /** The bar's trailing controls: round buttons, top right, as a navigation
   *  bar's are. */
  actions?: ReactNode;
  /**
   * What stays in view under the bar once the title has gone: a range to
   * choose, the filters applied. It sits under the large title at rest and
   * sticks beneath the bar as the page scrolls, as a segmented control under
   * an iOS large title does.
   */
  pinned?: ReactNode;
  /** Forwarded to the scroller, for remembering where the reader was. */
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** The list itself. */
  children: ReactNode;
}

/**
 * A tab's header as an iOS large-title screen draws one: a bar that stays put,
 * with the round controls at its trailing end, a large title that is part of
 * the page and scrolls away under the bar, the name coming in small and
 * centred there as it goes (ADR-240), and a pinned row (a range, the filters)
 * that sticks under the bar.
 *
 * The bar's ground is the floating headers' frosted wash
 * (`.floating-header-ground`), always on and ending at the bar's foot, so the
 * list passes under it as a soft shape and at rest it frosts nothing (ADR-185).
 * It used to be one block holding the title, the controls and the chips, all
 * pinned, which kept the title small and the controls beside it in the middle
 * of the row.
 *
 * The box reaches up under the status bar, so the list passes under the clock
 * as well, and the bar pads itself back down by the same safe area. The page
 * starts a bar's height down; the height is measured, because the safe area
 * and the text size set it.
 */
export function FloatingHeader({ scrollerRef, title, actions, pinned, onScroll, children }: FloatingHeaderProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const pinnedRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  // The large title has gone under the bar, so the bar shows the name.
  const [compact, setCompact] = useState(false);
  // The pinned row has reached the bar and sticks under it.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setHeight(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Read on every scroll rather than against a fixed distance: the title's
  // height depends on the language and the text size. Only reads layout, and
  // React drops an update that changes nothing.
  const measure = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const barBottom = bar.getBoundingClientRect().bottom;
    const name = titleRef.current;
    if (name) {
      // Halfway under is gone: behind the bar's ground the rest is unreadable.
      const r = name.getBoundingClientRect();
      setCompact((r.top + r.bottom) / 2 <= barBottom);
    }
    const row = pinnedRef.current;
    if (row) setStuck(row.getBoundingClientRect().top <= barBottom + 0.5);
  }, []);

  return (
    <div
      className="relative -mx-3 min-h-0 flex-1 overflow-hidden sm:-mx-6"
      // Up under the status bar. Inline, because Tailwind cannot negate an
      // env() value: `-mt-[env(...)]` builds no rule at all, silently.
      style={{ marginTop: "calc(-1 * env(safe-area-inset-top))", "--floating-bar-h": `${height}px` } as CSSProperties}
    >
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          measure();
          onScroll?.(e);
        }}
        // Ends clear of the tab bar on a tab, which `<main>` says through
        // `--tab-clear`; nothing anywhere else (ADR-171).
        className="ios-bounce h-full overflow-y-auto overscroll-contain pb-[var(--tab-clear,0px)]"
      >
        <div style={{ height }} aria-hidden="true" />
        {title && (
          <h1 ref={titleRef} className={`${LARGE_TITLE} mb-2 hyphens-auto break-words px-3 sm:px-6`}>
            {title}
          </h1>
        )}
        {pinned && (
          <div
            ref={pinnedRef}
            data-floating-pinned=""
            className="sticky z-[1] px-3 sm:px-6"
            style={{ top: height }}
          >
            {/* Its own frosted ground, reaching up behind the bar's fade once
                it sticks there, so the list passes under the two as one band
                rather than showing through a seam between them. */}
            <div
              aria-hidden="true"
              className={`floating-header-ground absolute inset-x-0 bottom-0 ${stuck ? "-top-3" : "top-0"}`}
            />
            <div className="relative">
              {pinned}
            </div>
          </div>
        )}
        {children}
      </div>

      {/* Measured on this box rather than on an inner one. It is positioned,
          so it contains the margins of the rows inside it. */}
      <div
        ref={barRef}
        data-floating-header=""
        className="absolute inset-x-0 top-0 z-[2] px-3 pt-[env(safe-area-inset-top)] sm:px-6"
      >
        <div aria-hidden="true" className="floating-header-ground absolute inset-0" />
        <div className="relative flex min-h-11 items-center justify-end gap-1 pb-1">
          {/* A picture of the large title, out of the accessibility tree, and
              nothing until the large one has gone under the bar: the name is
              never on screen twice. */}
          {title && (
            <p
              aria-hidden="true"
              data-compact-title=""
              className={`pointer-events-none absolute inset-x-24 top-0 flex h-11 items-center justify-center truncate text-body font-semibold text-ink transition-opacity duration-200 ${
                compact ? "opacity-100" : "opacity-0"
              }`}
            >
              {title}
            </p>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
