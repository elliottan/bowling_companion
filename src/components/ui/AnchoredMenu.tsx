import type { LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../lib/useOverlay";

interface AnchoredMenuProps {
  /** Viewport coordinates of the menu's top-leading corner, from the control
   *  that opened it (`getBoundingClientRect`). */
  left: number;
  top: number;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The long-press menu on a list row or a game chip. Portalled to the body: the
 * tab content sits inside `SwipePanes`, whose translateX would otherwise become
 * the containing block for a fixed overlay and drag the menu off-screen with it.
 *
 * Its scrim is transparent rather than dimmed. A menu is anchored to the thing
 * it acts on, so darkening the screen would hide the row you long-pressed.
 */
export function AnchoredMenu({ left, top, onClose, children }: AnchoredMenuProps) {
  const overlayRef = useOverlay<HTMLDivElement>(onClose);

  return createPortal(
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        ref={overlayRef}
        className="fixed z-20 w-44 origin-top animate-pop-in overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-lg"
        style={{ left, top }}
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
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium ${
        danger ? "text-danger-700 hover:bg-danger-50" : "text-ink hover:bg-surface-muted"
      }`}
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </button>
  );
}
