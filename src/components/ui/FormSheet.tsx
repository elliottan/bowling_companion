import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { useOverlay } from "../../lib/useOverlay";
import { useSheetDismiss } from "../../lib/useSheetDismiss";
import { IconButton } from "./IconButton";

interface FormSheetProps {
  /** Accessible name for the sheet, and the title in its bar. */
  title: string;
  onClose: () => void;
  /** The commit. Omitted where the sheet saves as you go, in which case the
   *  close is the only way out and the bar keeps its slot empty so the title
   *  stays centred. */
  onConfirm?: () => void;
  /** What the commit does, spoken: "Save", "Add", "Start session". */
  confirmLabel?: string;
  confirmDisabled?: boolean;
  /** Rendered above the body, outside the scroll area (an error banner). */
  banner?: ReactNode;
  /**
   * `"content"` (default) lets the sheet hug what is in it: a form is as tall
   * as its fields. `"tall"` fixes it at the same height it would cap out at,
   * for a sheet whose body is a list that arrives, filters and scrolls.
   *
   * A hugging sheet is anchored to the bottom edge, so anything that changes
   * its content height moves its *top* edge, with no animation on it. The
   * catalog picker shipped that way for one build: it slid up around a
   * "Loading catalog…" line, one row tall, and the moment the catalog resolved
   * the panel teleported up the screen. Searching it did the same thing in
   * reverse on every keystroke that narrowed the list.
   */
  size?: "content" | "tall";
  children: ReactNode;
}

/**
 * The app's one sheet for entering data: it rises from the bottom edge, can be
 * dragged back through it, and carries the close leading and the commit
 * trailing in its own bar (DESIGN-LANGUAGE §1, §6).
 *
 * Bottom rather than centred because that is where the keyboard comes from. A
 * centred dialog holding a focused text field gets shoved around by the iOS
 * keyboard and ends up half off-screen; a sheet is already anchored to the edge
 * the keyboard arrives at. That is the whole rule: you type in a sheet, you
 * answer a `ConfirmDialog`.
 */
export function FormSheet({
  title,
  onClose,
  onConfirm,
  confirmLabel = "Save",
  confirmDisabled = false,
  banner,
  size = "content",
  children
}: FormSheetProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting, dragHandlers } = useSheetDismiss(onClose);
  const overlayRef = useOverlay<HTMLDivElement>(dismiss);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-3"
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/40" style={backdropStyle} onClick={() => dismiss()} />
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`relative flex max-h-[92%] w-full max-w-lg flex-col rounded-t-2xl bg-surface shadow-xl sm:max-h-[85%] sm:rounded-2xl ${
          size === "tall" ? "h-[92%] sm:h-[85%]" : ""
        } ${exiting ? "" : "animate-slide-up"}`}
      >
        <div
          className="flex touch-none cursor-grab justify-center pt-2 active:cursor-grabbing sm:hidden"
          {...dragHandlers}
        >
          <div className="h-1.5 w-10 rounded-full bg-edge-strong" />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-edge px-2 py-2">
          <IconButton onClick={() => dismiss()} label="Close" variant="round">
            <X size={20} aria-hidden="true" />
          </IconButton>
          <h2 className="flex-1 text-center text-[17px] font-semibold text-ink">{title}</h2>
          {onConfirm ? (
            <IconButton
              variant="confirm"
              onClick={() => onConfirm()}
              disabled={confirmDisabled}
              label={confirmLabel}
            >
              <Check size={20} aria-hidden="true" />
            </IconButton>
          ) : (
            <span className="h-11 w-11 shrink-0" />
          )}
        </div>

        {banner && <div className="shrink-0 px-4 pt-3">{banner}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
