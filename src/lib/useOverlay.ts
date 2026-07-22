import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Shared dismissal + accessibility behaviour for modal-ish overlays (dialogs,
 * sheets, full-screen panels): Escape closes it, Tab is trapped inside it
 * while it's open, and focus returns to whatever triggered it on close.
 * Before this hook, most overlays in the app hand-rolled at most the Escape
 * part (many had none of it), so tabbing inside a sheet leaked focus onto the
 * page behind it and closing one never gave focus back to the button that
 * opened it.
 *
 * Usage: `const ref = useOverlay<HTMLDivElement>(onClose); return <div ref={ref} role="dialog" ...>`.
 * The ref must land on the actual overlay container (its focus trap boundary),
 * which matters for portalled content — point it at the portalled node, not
 * something at the trigger's position in the tree.
 *
 * Pass `active=false` (default `true`) to switch everything off — e.g. an
 * outer overlay while an inner one (a nested sheet/dialog) is open, so a
 * single Escape press and the focus trap only ever apply to the topmost layer.
 */
export function useOverlay<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  active = true
): RefObject<T> {
  const ref = useRef<T>(null);
  // Latest onClose without re-subscribing the listener every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = ref.current;

    if (container) {
      const focusable = getFocusable(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (container.tabIndex === -1) {
        container.focus();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const c = ref.current;
      if (!c) return;
      const focusable = getFocusable(c);
      if (focusable.length === 0) {
        // Nothing to tab to inside the overlay — keep focus from escaping it.
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !c.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !c.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
