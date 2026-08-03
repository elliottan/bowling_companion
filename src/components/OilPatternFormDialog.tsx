import { useState, type FormEvent } from "react";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Button } from "./ui/Button";
import type { OilPattern } from "../types/bowling";

interface OilPatternFormDialogProps {
  open: boolean;
  /** Prefill for the edit flow; omit to create. */
  initial?: OilPattern;
  onSubmit: (values: { name: string; url?: string }) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  "h-11 w-full min-w-0 box-border rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20";

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
        className={`my-auto w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <h2 className="text-lg font-bold text-ink">
            {initial ? "Edit oil pattern" : "Add oil pattern"}
          </h2>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Name</span>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Kegel Main Street"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">
                Pattern sheet link
              </span>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputClass}
                placeholder="https://…/main-street.pdf"
                autoComplete="off"
              />
              <span className="mt-1 block text-xs text-ink-tertiary">
                Optional. Usually a PDF, and it opens in a new tab.
              </span>
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dismiss()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
