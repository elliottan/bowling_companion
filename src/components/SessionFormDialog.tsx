import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { SessionForm, type NewSessionFormValues, type SessionFormInitial } from "./SessionForm";

interface SessionFormDialogProps {
  open: boolean;
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /** Prefill (edit flow). Omit for create. */
  initial?: SessionFormInitial;
  title?: string;
  submitLabel?: string;
}

/**
 * Modal hosting the shared session form — used for both creating a new session
 * and editing an existing one, so the two flows share every field.
 */
export function SessionFormDialog({
  open,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initial,
  title,
  submitLabel
}: SessionFormDialogProps) {
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(onCancel, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      style={backdropStyle}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`my-auto w-full max-w-sm overflow-hidden rounded-xl bg-surface shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* `key` remounts the form when the prefill changes so a freshly opened
            edit dialog starts from the right values. */}
        <SessionForm
          key={open ? (initial ? `edit-${initial.alley_name}-${initial.date}` : "create") : "closed"}
          onSubmit={onSubmit}
          onCancel={() => dismiss()}
          isSubmitting={isSubmitting}
          initial={initial}
          title={title}
          submitLabel={submitLabel}
        />
      </div>
    </div>
  );
}
