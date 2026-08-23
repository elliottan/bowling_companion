import { useState, type FormEvent } from "react";
import { FormSheet } from "./ui/FormSheet";
import { FIELD, FIELD_LABEL } from "./ui/field";
import type { OilPattern } from "../types/bowling";

const FORM_ID = "oil-pattern-form";

interface OilPatternFormDialogProps {
  open: boolean;
  /** Prefill for the edit flow; omit to create. */
  initial?: OilPattern;
  onSubmit: (values: { name: string; url?: string }) => Promise<void>;
  onCancel: () => void;
}

/** Add or rename an oil pattern, and point it at its pattern sheet. */
export function OilPatternFormDialog({ open, initial, onSubmit, onCancel }: OilPatternFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit({ name, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save pattern.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormSheet
      title={initial ? "Edit oil pattern" : "Add oil pattern"}
      onClose={onCancel}
      onConfirm={() => {
        const form = document.getElementById(FORM_ID);
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      confirmLabel="Save"
      confirmDisabled={isSaving || name.trim().length === 0}
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="space-y-3">
            <label className="block">
              <span className={FIELD_LABEL}>Name</span>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
                placeholder="Kegel Main Street"
              />
            </label>

            <label className="block">
              <span className={FIELD_LABEL}>Pattern sheet link (optional)</span>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={FIELD}
                placeholder="https://…/main-street.pdf"
                autoComplete="off"
              />
              <span className="mt-1 block text-xs text-ink-tertiary">
                Usually a PDF, and it opens in a new tab.
              </span>
            </label>

            {error && <p className="text-xs text-danger-700">{error}</p>}
          </div>
      </form>
    </FormSheet>
  );
}
