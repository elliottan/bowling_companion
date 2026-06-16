import { useEffect, useState } from "react";
import type { UpdateSessionInput } from "../services/bowlingRepository";

interface SessionEditDialogProps {
  open: boolean;
  initial: { alley_name: string; date: string; description?: string };
  onSave: (values: UpdateSessionInput) => Promise<void> | void;
  onCancel: () => void;
}

const fieldClass =
  "h-11 w-full box-border rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20";

/** Modal to edit a session's alley, date, and description. */
export function SessionEditDialog({ open, initial, onSave, onCancel }: SessionEditDialogProps) {
  const [alley, setAlley] = useState(initial.alley_name);
  const [date, setDate] = useState(initial.date);
  const [description, setDescription] = useState(initial.description ?? "");
  const [saving, setSaving] = useState(false);

  // Reset fields whenever a new session opens the dialog.
  useEffect(() => {
    if (!open) return;
    setAlley(initial.alley_name);
    setDate(initial.date);
    setDescription(initial.description ?? "");
    setSaving(false);
  }, [open, initial.alley_name, initial.date, initial.description]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  async function handleSave() {
    if (!alley.trim() || saving) return;
    setSaving(true);
    await onSave({ alley_name: alley.trim(), date, description: description.trim() || undefined });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-950">Edit session</h2>
        <div className="mt-4 space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alley</span>
            <input value={alley} onChange={(e) => setAlley(e.target.value)} className={fieldClass} placeholder="Orchid Bowl" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass}
              placeholder="League night, practice..."
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!alley.trim() || saving}
            className="inline-flex h-10 items-center rounded-lg bg-felt-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
