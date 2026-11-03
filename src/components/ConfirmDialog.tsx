import { useEffect, useReducer, useRef } from "react";
import { askNativeConfirm, nativeAlertMissing } from "../lib/nativeAlert";
import { isIOSApp } from "../lib/platform";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Button } from "./ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  /** Red for a confirm that loses something, the default; primary for one
   *  that only goes somewhere (the Pro page). */
  confirmVariant?: "danger" | "primary";
  cancelLabel?: string;
  /** For a confirm that has to be earned: a typed phrase, a busy save. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation, with a destructive (red) confirm button unless told
 *  otherwise.
 *
 *  In the iPhone app a confirm that is only words is asked by UIKit's own
 *  alert (ADR-232): the phone's material, type and destructive red, not a card
 *  imitating them. One that carries more than words (a typed phrase, a count in
 *  bold) or a confirm that has to be earned stays the page's, and so does every
 *  confirm in an app built without the plugin. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  confirmVariant = "danger",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onCancel, "center");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const native =
    open &&
    isIOSApp() &&
    !nativeAlertMissing() &&
    !confirmDisabled &&
    (message === undefined || message === null || typeof message === "string");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open && !native);

  // The answer runs whichever handlers are current when it arrives.
  const handlers = useRef({ onConfirm, onCancel });
  useEffect(() => {
    handlers.current = { onConfirm, onCancel };
  });
  useEffect(() => {
    if (!native) return;
    let live = true;
    void askNativeConfirm({
      title,
      message: typeof message === "string" ? message : undefined,
      confirmLabel,
      cancelLabel,
      destructive: confirmVariant === "danger"
    }).then((answer) => {
      if (!live) return;
      if (answer === "confirm") handlers.current.onConfirm();
      else if (answer === "cancel") handlers.current.onCancel();
      // Missing from this build: draw the page's own, now and from here on.
      else rerender();
    });
    return () => {
      live = false;
    };
    // Asked once each time it opens; a re-render while the alert is up is not
    // a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  if (!open || native) return null;

  // z-[80] clears the lane visualizer (z-[70]): a confirm is always the topmost
  // thing on screen, and the completed-game edit prompt is raised from inside it.
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      style={{ ...backdropStyle, ...rootStyle }}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        className={`w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {message && <div className="mt-1.5 space-y-2 text-sm text-ink-secondary">{message}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dismiss()}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} disabled={confirmDisabled} onClick={() => dismiss(onConfirm)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
