import { Check, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
   * A line under the title saying what the sheet is about, such as the
   * filters behind a list of numbers. With one, the title sits leading beside
   * the close rather than centred, so the line has the bar's width to use,
   * and it stays on screen however far the body scrolls.
   */
  subtitle?: string;
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
  /**
   * How the sheet is left. `"close"` (default) puts an X leading, for a sheet
   * you can back out of without keeping what you did.
   *
   * `"done"` drops the X and puts a tick trailing instead, for a sheet that has
   * already applied everything as you went: there is nothing to cancel, so an X
   * is a lie about what leaving does, and the tick says the thing on screen is
   * the thing you keep.
   */
  dismissAs?: "close" | "done";
  /** Replaces the commit in the trailing slot, for a sheet whose trailing
   *  control changes with its state (a pencil that turns into the tick). */
  trailing?: ReactNode;
  /** False while a sheet or dialog is open on top of this one, so Escape and
   *  the focus trap belong to the topmost layer only. */
  active?: boolean;
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
  subtitle,
  size = "content",
  dismissAs = "close",
  trailing,
  active = true,
  children
}: FormSheetProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting, dragHandlers } = useSheetDismiss(onClose);
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, active);
  const barRef = useRef<HTMLDivElement | null>(null);
  // Before the first paint, so the body never shows a frame under the bar.
  // Until it is measured, the height a plain bar is (a pill and a 44pt row).
  const [barHeight, setBarHeight] = useState(76);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => {
      if (el.offsetHeight > 0) setBarHeight(el.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
        // Floats as an iOS 26 sheet does (ADR-186): inset from the sides and the
        // bottom, with every corner rounded to follow the phone's own, rather
        // than a slab with square feet sitting on the screen's edge.
        className={`relative mb-2 flex max-h-[92%] w-[calc(100%-1rem)] max-w-lg flex-col rounded-[38px] bg-surface shadow-2xl sm:mb-0 sm:max-h-[85%] sm:w-full sm:rounded-2xl ${
          size === "tall" ? "h-[92%] sm:h-[85%]" : ""
        } ${exiting ? "" : "animate-slide-up"}`}
      >
        {/* The pill, the title bar and a banner float over the body, which
            scrolls under them as it does under an iOS sheet's bar (ADR-168).
            The scroll edge behind them shows only once something passes
            beneath. Measured, since a subtitle or a banner changes the height,
            and published as `--sheet-bar-h` for a sticky row in the body to
            stop beneath the bar. */}
        <div ref={barRef} className="absolute inset-x-0 top-0 z-20 [--edge-color:var(--color-surface)]">
          <div aria-hidden="true" className="scroll-edge absolute inset-x-0 -bottom-4 top-0 rounded-t-[38px] sm:rounded-t-2xl" />
          {/* The pill and the title bar are one grab area: the pill alone was a
              sixteen-pixel strip, easy to miss with a thumb. The controls in the
              bar still take their own taps (useSheetDismiss). */}
          <div
            className="relative flex touch-none cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing sm:hidden"
            {...dragHandlers}
          >
            <div className="h-1.5 w-10 rounded-full bg-edge-strong" />
          </div>

          <div
            // In from the edge far enough that the round controls sit clear of
            // the sheet's deep corners, as the system's do.
            className="relative flex shrink-0 touch-none items-center gap-2 px-3.5 py-2 sm:touch-auto"
            {...dragHandlers}
          >
            {dismissAs === "close" ? (
              <IconButton onClick={() => dismiss()} label="Close" variant="round">
                <X size={20} aria-hidden="true" />
              </IconButton>
            ) : (
              <span className="h-11 w-11 shrink-0" />
            )}
            {subtitle ? (
              <div className="min-w-0 flex-1 py-0.5 text-left">
                <h2 className="text-[17px] font-semibold leading-tight text-ink">{title}</h2>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{subtitle}</p>
              </div>
            ) : (
              <h2 className="flex-1 text-center text-[17px] font-semibold text-ink">{title}</h2>
            )}
            {trailing ? (
              trailing
            ) : onConfirm ? (
              <IconButton
                variant="confirm"
                onClick={() => onConfirm()}
                disabled={confirmDisabled}
                label={confirmLabel}
              >
                <Check size={20} aria-hidden="true" />
              </IconButton>
            ) : dismissAs === "done" ? (
              // Leaves through `dismiss` like the X it replaces, so the sheet
              // still plays its exit rather than blinking out.
              <IconButton variant="confirm" onClick={() => dismiss()} label="Done">
                <Check size={20} aria-hidden="true" />
              </IconButton>
            ) : subtitle ? null : (
              // Balances the close, so a centred title is centred. A leading
              // title has nothing to balance and wants the width.
              <span className="h-11 w-11 shrink-0" />
            )}
          </div>

          {banner && <div className="relative px-4 pb-1 pt-1">{banner}</div>}
        </div>

        <div
          // The sheet stops 8px above the screen's foot, so the home indicator's
          // inset is that much smaller inside it.
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.25rem))] pt-[calc(var(--sheet-bar-h)+1rem)]"
          style={{ "--sheet-bar-h": `${barHeight}px` } as CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
