import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The floating row above the tab bar (DESIGN-LANGUAGE §7b). A tab with one
 * dominant action puts it here, in the thumb corner, and anything else that
 * floats shares the row to its left rather than displacing it.
 *
 * Portalled out of `<main>`: the tab-switch animation transforms it, and a
 * transformed ancestor becomes the containing block for a fixed child, which
 * makes the row ride the animation and jump on arrival. The target is the app
 * shell rather than the body so overlays (z-50) still stack above it.
 */
export function FabRow({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto flex max-w-xl items-center gap-2 sm:bottom-6">
      {children}
    </div>,
    document.getElementById("app-shell") ?? document.body
  );
}

/**
 * The primary action itself. `label` is required, like `IconButton`.
 *
 * `extended` prints the label beside the icon, as a pill. A plus alone says
 * "add" and nothing about what, which is fine where the screen is a list of one
 * kind of thing and not on Home, where it starts a session.
 */
export function Fab({
  icon: Icon,
  label,
  onClick,
  extended = false
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  extended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={extended ? undefined : label}
      className={`pointer-events-auto ml-auto flex h-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-accent-on-fill shadow-2xl active:bg-accent-fill-hover ${
        extended ? "gap-2 pl-5 pr-6 text-base font-semibold" : "w-14"
      }`}
    >
      <Icon size={extended ? 22 : 26} aria-hidden="true" />
      {extended && label}
    </button>
  );
}
