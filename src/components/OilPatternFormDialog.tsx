import { useState, type FormEvent } from "react";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Check, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { FIELD, FIELD_LABEL } from "./ui/field";
import type { OilPattern } from "../types/bowling";

interface OilPatternFormDialogProps {
  open: boolean;
  /** Prefill for the edit flow; omit to create. */
  initial?: OilPattern;
  onSubmit: (values: { name: string; url?: string }) => Promise<void>;
  onCancel: () => void;
}

/** Add or rename an oil pattern, and point it at its pattern sheet. */
export function OilPatternFormDialog({ open, initial, onSubmit, onCancel }: OilPatternFormDialogProps) {
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(onCancel, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);
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
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 border-b border-edge px-2 py-2">
            <IconButton onClick={() => dismiss()} label="Cancel" variant="round">
              <X size={20} aria-hidden="true" />
            </IconButton>
            <h2 className="flex-1 text-center text-[17px] font-semibold text-ink">
              {initial ? "Edit oil pattern" : "Add oil pattern"}
            </h2>
            <IconButton type="submit" variant="confirm" disabled={isSaving} label="Save">
              <Check size={20} aria-hidden="true" />
            </IconButton>
          </div>

          <div className="space-y-3 px-5 pb-5 pt-4">
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
      </div>
    </div>
  );
}
