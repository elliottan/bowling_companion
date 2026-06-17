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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addBall,
  deleteBall,
  getBalls,
  reorderBalls,
  updateBall,
} from "../services/ballRepository";
import type { Ball } from "../types/bowling";

const EMPTY_FORM = {
  name: "",
  is_spare_ball: false,
  layout: "",
  notes: ""
};

type FormState = typeof EMPTY_FORM;

interface SortableBallRowProps {
  ball: Ball;
  onEdit: (ball: Ball) => void;
  onDelete: (id: number) => void;
}

function SortableBallRow({ ball, onEdit, onDelete }: SortableBallRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ball.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`flex items-start gap-2 rounded-lg border bg-white p-4 shadow-sm ${
          isDragging ? "border-felt-700 opacity-90 shadow-md" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${ball.name}`}
          className="mt-0.5 touch-none shrink-0 text-slate-300 hover:text-slate-500"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-950">{ball.name}</span>
            {ball.is_spare_ball && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Spare ball
              </span>
            )}
          </div>
          {ball.layout && (
            <p className="mt-0.5 text-xs text-slate-500">{ball.layout}</p>
          )}
          {ball.notes && (
            <p className="mt-1 text-sm text-slate-600">{ball.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(ball)}
            aria-label={`Edit ${ball.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(ball.id!)}
            aria-label={`Delete ${ball.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function ArsenalView() {
  const [balls, setBalls] = useState<Ball[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      setBalls(await getBalls());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load arsenal.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = balls.findIndex((b) => b.id === active.id);
    const newIndex = balls.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(balls, oldIndex, newIndex);
    setBalls(next);
    try {
      await reorderBalls(next.map((b) => b.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order.");
      await load();
    }
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(ball: Ball) {
    setEditingId(ball.id ?? null);
    setForm({
      name: ball.name,
      is_spare_ball: ball.is_spare_ball,
      layout: ball.layout ?? "",
      notes: ball.notes ?? ""
    });
    setFormError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Ball name is required.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        name,
        is_spare_ball: form.is_spare_ball,
        layout: form.layout.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingId !== null) {
        await updateBall(editingId, payload);
      } else {
        await addBall(payload);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save ball.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError("");
    try {
      await deleteBall(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ball.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-950">Arsenal</h1>
        {!showForm && (
          <button
            type="button"
            onClick={openAddForm}
            aria-label="Add ball"
            className="text-2xl leading-none text-slate-500 hover:text-slate-800 px-1"
          >
            +
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {showForm && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-950">
            {editingId !== null ? "Edit ball" : "Add ball"}
          </h2>

          {formError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {formError}
            </p>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Storm Phaze II"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>

            <div className="flex items-start gap-3">
              <input
                id="is_spare_ball"
                type="checkbox"
                checked={form.is_spare_ball}
                onChange={(e) =>
                  setForm((f) => ({ ...f, is_spare_ball: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-felt-700"
              />
              <div>
                <label
                  htmlFor="is_spare_ball"
                  className="text-sm font-medium text-slate-700"
                >
                  Spare ball
                </label>
                <p className="text-xs text-slate-500">
                  Auto-selected for spare shots. Only one ball can be marked as spare ball.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Layout <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.layout}
                onChange={(e) => setForm((f) => ({ ...f, layout: e.target.value }))}
                placeholder='e.g. 45° × 4-1/2″ × 35°'
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Any notes about this ball…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : editingId !== null ? "Save ball" : "Add ball"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={isSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : balls.length === 0 ? (
        <p className="text-sm text-slate-500">
          No balls in your arsenal yet. Add your first ball.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <SortableContext items={balls.map((b) => b.id!)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {balls.map((ball) => (
                <SortableBallRow
                  key={ball.id}
                  ball={ball}
                  onEdit={openEditForm}
                  onDelete={(id) => void handleDelete(id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
