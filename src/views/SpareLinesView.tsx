import { GripVertical, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PinGrid } from "../components/PinGrid";
import { derivePinBoard } from "../lib/pinGeometry";
import {
  deleteSpareLine,
  ensureDefaultSpareLines,
  getSpareLinesAll,
  reorderSpareLines,
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

interface SortableSpareCardProps {
  sl: SpareLine;
  onEdit: (sl: SpareLine) => void;
}

function SortableSpareCard({ sl, onEdit }: SortableSpareCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sl.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`relative flex w-full select-none flex-col items-center gap-1.5 rounded-lg border bg-white p-3 text-center shadow-sm ${
          isDragging ? "border-felt-700 opacity-90 shadow-md" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder spare for pins ${sl.pins.join(", ")}`}
          className="absolute right-1 top-1 touch-none rounded p-1 text-slate-300 hover:text-slate-500"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(sl)}
          aria-label={`Edit spare line for pins ${sl.pins.join(", ")}`}
          className="flex w-full flex-col items-center gap-1.5 active:opacity-70"
        >
          <SmallPinDiagram standing={sl.pins} />
          {sl.line ? (
            <span className="block text-xs font-semibold text-slate-700">
              S{sl.line.stance ?? "·"} · T{sl.line.target ?? "·"}
              {derivePinBoard(sl.line, sl.pins) != null && (
                <span className="text-felt-700"> · pin {derivePinBoard(sl.line, sl.pins)}</span>
              )}
            </span>
          ) : (
            <span className="block text-xs text-slate-400">No line</span>
          )}
          {sl.notes && (
            <span className="line-clamp-2 block text-[11px] text-slate-500">{sl.notes}</span>
          )}
        </button>
      </div>
    </li>
  );
}

const EMPTY_LINE: LineSpec = {};

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

  // Press-and-hold the grip handle to start a drag; a quick tap still edits.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = spareLines.findIndex((s) => s.id === active.id);
    const newIndex = spareLines.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(spareLines, oldIndex, newIndex);
    setSpareLines(next); // optimistic
    try {
      await reorderSpareLines(next.map((s) => s.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order.");
      await load();
    }
  }

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

    // Breakpoint is no longer entered for spares — keep only stance + target.
    const line: LineSpec | undefined = formHasLine
      ? { ...(formLine.stance != null && { stance: formLine.stance }), ...(formLine.target != null && { target: formLine.target }) }
      : undefined;

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
          <h2 className="mb-3 text-base font-semibold text-slate-950">
            {formPins.length === 0
              ? "Add spare line"
              : `${formPins.length === 1 ? "Pin" : "Pins"} ${lineLabel(formPins)}`}
          </h2>

          {formError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {formError}
            </p>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              {editingId === null && (
                <p className="mb-2 text-xs text-slate-500">
                  Tap pins to select which pins are left standing for this leave.
                </p>
              )}
              <PinGrid
                standingPins={formPins}
                availablePins={ALL_PINS}
                onChange={setFormPins}
                readOnly={editingId !== null}
              />
            </div>

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
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Stance
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={formLine.stance ?? ""}
                        onChange={(e) =>
                          setFormLine((l) => ({
                            ...l,
                            stance: e.target.value === "" ? undefined : Number(e.target.value)
                          }))
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
                        inputMode="decimal"
                        step="0.5"
                        value={formLine.target ?? ""}
                        onChange={(e) =>
                          setFormLine((l) => ({
                            ...l,
                            target: e.target.value === "" ? undefined : Number(e.target.value)
                          }))
                        }
                        placeholder="e.g. 10"
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                      />
                    </div>
                  </div>
                  {derivePinBoard(formLine, formPins) != null && (
                    <p className="mt-2 text-xs text-slate-500">
                      Straight-line board at the front pin:{" "}
                      <span className="font-semibold text-felt-700">
                        {derivePinBoard(formLine, formPins)}
                      </span>
                    </p>
                  )}
                </>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <SortableContext
            items={spareLines.map((s) => s.id!)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {spareLines.map((sl) => (
                <SortableSpareCard key={sl.id} sl={sl} onEdit={openEditForm} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
