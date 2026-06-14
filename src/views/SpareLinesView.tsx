import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PinGrid } from "../components/PinGrid";
import {
  deleteSpareLine,
  ensureDefaultSpareLines,
  getSpareLinesAll,
  upsertSpareLine,
} from "../services/ballRepository";
import type { LineSpec, PinNumber, SpareLine } from "../types/bowling";

function SmallPinDiagram({ standing }: { standing: PinNumber[] }) {
  const standingSet = new Set(standing);
  const rows: PinNumber[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
  return (
    <div className="flex flex-col items-center gap-0.5">
      {rows.map((row) => (
        <div key={row.join("-")} className="flex gap-0.5">
          {row.map((pin) => (
            <div
              key={pin}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                standingSet.has(pin as PinNumber)
                  ? "bg-felt-700 text-white"
                  : "bg-slate-100 text-slate-300"
              }`}
            >
              {pin}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const EMPTY_LINE: LineSpec = { stance: 0, target: 0, breakpoint: 0 };

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function SpareLinesView() {
  const [spareLines, setSpareLines] = useState<SpareLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // For add: which pins are standing (the leave being shot at)
  const [formPins, setFormPins] = useState<PinNumber[]>([]);
  const [formHasLine, setFormHasLine] = useState(false);
  const [formLine, setFormLine] = useState<LineSpec>(EMPTY_LINE);
  const [formNotes, setFormNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      await ensureDefaultSpareLines();
      setSpareLines(await getSpareLinesAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load spare lines.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAddForm() {
    setEditingId(null);
    setFormPins([]);
    setFormHasLine(false);
    setFormLine(EMPTY_LINE);
    setFormNotes("");
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(sl: SpareLine) {
    setEditingId(sl.id ?? null);
    setFormPins(sl.pins);
    setFormHasLine(sl.line !== undefined);
    setFormLine(sl.line ?? EMPTY_LINE);
    setFormNotes(sl.notes ?? "");
    setFormError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setFormPins([]);
    setFormHasLine(false);
    setFormLine(EMPTY_LINE);
    setFormNotes("");
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formPins.length === 0) {
      setFormError("Select at least one pin for this leave.");
      return;
    }

    const line = formHasLine ? formLine : undefined;

    setIsSaving(true);
    setFormError("");
    try {
      if (editingId !== null) {
        // Update: pins are fixed, only line + notes change
        await upsertSpareLine(formPins, line, formNotes.trim() || undefined);
      } else {
        await upsertSpareLine(formPins, line, formNotes.trim() || undefined);
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save spare line.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError("");
    try {
      await deleteSpareLine(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spare line.");
    }
  }

  function lineLabel(pins: PinNumber[]): string {
    return pins.join(", ");
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-950">Spare Lines</h1>
        {!showForm && (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600 disabled:opacity-50"
          >
            + Add spare
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onClick={cancelForm}
        >
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-3 text-sm font-semibold text-slate-950">
            {editingId !== null ? `Edit spare line — pins ${lineLabel(formPins)}` : "Add spare line"}
          </h2>

          {formError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {formError}
            </p>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {editingId === null && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Pin leave <span className="text-red-500">*</span>
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  Tap pins to select which pins are left standing for this leave.
                </p>
                <PinGrid
                  standingPins={formPins}
                  availablePins={ALL_PINS}
                  onChange={setFormPins}
                />
                {formPins.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {lineLabel(formPins)}
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2">
                <input
                  id="has_line"
                  type="checkbox"
                  checked={formHasLine}
                  onChange={(e) => setFormHasLine(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-felt-700"
                />
                <label htmlFor="has_line" className="text-sm font-medium text-slate-700">
                  Set shooting line (board numbers)
                </label>
              </div>

              {formHasLine && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Stance
                    </label>
                    <input
                      type="number"
                      value={formLine.stance || ""}
                      onChange={(e) =>
                        setFormLine((l) => ({ ...l, stance: Number(e.target.value) }))
                      }
                      placeholder="e.g. 35"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Target
                    </label>
                    <input
                      type="number"
                      value={formLine.target || ""}
                      onChange={(e) =>
                        setFormLine((l) => ({ ...l, target: Number(e.target.value) }))
                      }
                      placeholder="e.g. 10"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Breakpoint
                    </label>
                    <input
                      type="number"
                      value={formLine.breakpoint || ""}
                      onChange={(e) =>
                        setFormLine((l) => ({ ...l, breakpoint: Number(e.target.value) }))
                      }
                      placeholder="e.g. 6"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Any notes about this spare…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : editingId !== null ? "Save spare line" : "Add spare line"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={isSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleDelete(editingId);
                    cancelForm();
                  }}
                  disabled={isSaving}
                  aria-label={`Delete spare line for pins ${lineLabel(formPins)}`}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              )}
            </div>
          </form>
        </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : spareLines.length === 0 ? (
        <p className="text-sm text-slate-500">No spare lines yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {spareLines.map((sl) => (
            <li key={sl.id}>
              <button
                type="button"
                onClick={() => openEditForm(sl)}
                aria-label={`Edit spare line for pins ${lineLabel(sl.pins)}`}
                className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm transition-colors active:bg-slate-50"
              >
                <SmallPinDiagram standing={sl.pins} />
                {sl.line ? (
                  <p className="text-xs font-semibold text-slate-700">
                    S{sl.line.stance} · T{sl.line.target} · B{sl.line.breakpoint}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">No line</p>
                )}
                {sl.notes && (
                  <p className="line-clamp-2 text-[11px] text-slate-500">{sl.notes}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
