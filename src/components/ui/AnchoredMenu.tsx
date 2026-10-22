import type { LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../lib/useOverlay";

interface AnchoredMenuProps {
  /** Viewport coordinates of the menu's leading edge and its top, from the
   *  control that opened it (`getBoundingClientRect`). */
  left: number;
  top?: number;
  /** Distance from the viewport's bottom edge to the menu's bottom, in place
   *  of `top`, for a menu that opens upward off a control low on the screen. */
  bottom?: number;
  /** Which side of the menu lines up with the button, so it grows out of the
   *  button's corner: `end` for a menu hung off a button's right edge. */
  align?: "start" | "end";
  onClose: () => void;
  children: React.ReactNode;
}

// Spelled out whole, so Tailwind sees every class it has to build.
const ORIGIN = {
  top: { start: "origin-top-left", end: "origin-top-right" },
  bottom: { start: "origin-bottom-left", end: "origin-bottom-right" }
} as const;

/** The menu's width, for a caller placing it so it stays on screen. */
export const ANCHORED_MENU_WIDTH = 240;

/**
 * The menu a tapped button opens beside itself: the scorer's More, the layout
 * presets. Drawn as an iOS menu is (ADR-185): a frosted panel with deep
 * corners, a row a finger tall, the label leading and its glyph trailing, and
 * it grows out of the button that opened it rather than fading in in place.
 *
 * Portalled to the body: the tab content sits inside `SwipePanes`, whose
 * translateX would otherwise become the containing block for a fixed overlay
 * and drag the menu off-screen with it. Its scrim is transparent rather than
 * dimmed: a menu is anchored to the thing it acts on, and dimming would hide it.
 */
export function AnchoredMenu({ left, top, bottom, align = "start", onClose, children }: AnchoredMenuProps) {
  const overlayRef = useOverlay<HTMLDivElement>(onClose);

  return createPortal(
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        ref={overlayRef}
        className={`anchored-menu fixed z-20 animate-menu-in overflow-hidden rounded-[22px] py-1.5 ${
          ORIGIN[bottom != null ? "bottom" : "top"][align]
        }`}
        style={{ width: ANCHORED_MENU_WIDTH, ...(bottom != null ? { left, bottom } : { left, top }) }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/** One row of an `AnchoredMenu`. `danger` for the destructive one. Left as a
 *  plain button rather than a `menuitem`: the ARIA menu roles come with a
 *  keyboard contract (arrow keys move between items) that this does not
 *  implement, and claiming the role without the behaviour is worse than not
 *  claiming it. */
export function AnchoredMenuItem({
  icon: Icon,
  onClick,
  danger = false,
  children
}: {
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The pressed row is an inset capsule, as iOS 26 lights a menu row,
      // rather than a band edge to edge.
      className={`mx-1.5 flex h-11 w-[calc(100%-0.75rem)] items-center gap-3 rounded-full px-3.5 text-left text-[17px] active:bg-ink/10 ${
        danger ? "text-danger-600" : "text-ink"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Icon size={18} aria-hidden="true" className="shrink-0" />
    </button>
  );
}
