import { useOverlay } from "../lib/useOverlay";
import { Button } from "./ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation with a destructive (red) confirm button. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const overlayRef = useOverlay<HTMLDivElement>(onCancel, open);

  if (!open) return null;

  // z-[80] clears the lane visualizer (z-[70]): a confirm is always the topmost
  // thing on screen, and the completed-game edit prompt is raised from inside it.
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        ref={overlayRef}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {message && <div className="mt-1.5 space-y-2 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
