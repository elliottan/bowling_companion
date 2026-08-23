import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Button } from "./ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  /** For a confirm that has to be earned: a typed phrase, a busy save. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation with a destructive (red) confirm button. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  confirmDisabled = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(onCancel, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  if (!open) return null;

  // z-[80] clears the lane visualizer (z-[70]): a confirm is always the topmost
  // thing on screen, and the completed-game edit prompt is raised from inside it.
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      style={backdropStyle}
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
            Cancel
          </Button>
          <Button variant="danger" disabled={confirmDisabled} onClick={() => dismiss(onConfirm)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
