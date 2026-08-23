import { useCallback, useState } from "react";
import { FormSheet } from "./ui/FormSheet";
import { SessionForm, type NewSessionFormValues, type SessionFormInitial } from "./SessionForm";

const FORM_ID = "session-form";

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
 * Sheet hosting the shared session form, used for both creating a new session
 * and editing an existing one, so the two flows share every field.
 */
export function SessionFormDialog({
  open,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initial,
  title = "Start new session",
  submitLabel = "Start session"
}: SessionFormDialogProps) {
  const [canSubmit, setCanSubmit] = useState(false);
  // Stable, so the form's report effect doesn't re-run every render.
  const handleCanSubmitChange = useCallback((value: boolean) => setCanSubmit(value), []);

  if (!open) return null;

  return (
    <FormSheet
      title={title}
      onClose={onCancel}
      onConfirm={() => {
        const form = document.getElementById(FORM_ID);
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      confirmLabel={submitLabel}
      confirmDisabled={!canSubmit}
    >
      {/* `key` remounts the form when the prefill changes so a freshly opened
          edit sheet starts from the right values. */}
      <SessionForm
        key={initial ? `edit-${initial.alley_name}-${initial.date}` : "create"}
        formId={FORM_ID}
        onSubmit={onSubmit}
        onCanSubmitChange={handleCanSubmitChange}
        isSubmitting={isSubmitting}
        initial={initial}
      />
    </FormSheet>
  );
}
