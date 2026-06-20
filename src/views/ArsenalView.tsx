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
import { BookOpen, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addBall,
  deleteBall,
  getBalls,
  reorderBalls,
  updateBall,
} from "../services/ballRepository";
import {
  getAllCatalog,
  syncCatalog,
} from "../services/ballCatalogRepository";
import type { Ball } from "../types/bowling";
import type { CatalogBall } from "../types/catalog";
import { CatalogBallImage } from "../components/CatalogBallImage";

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

interface ArsenalViewProps {
  onOpenCatalog?: () => void;
}

export function ArsenalView({ onOpenCatalog }: ArsenalViewProps = {}) {
  const [balls, setBalls] = useState<Ball[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Catalog picker state (inline within the arsenal add-ball flow)
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogBalls, setCatalogBalls] = useState<CatalogBall[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  // When a catalog ball is chosen, store it here so handleSubmit can attach the snapshot.
  const [formCatalogRef, setFormCatalogRef] = useState<CatalogBall | null>(null);

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
    setFormCatalogRef(null);
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
    setFormCatalogRef(null);
  }

  async function openCatalogPicker() {
    setShowCatalogPicker(true);
    setCatalogSearch("");
    setCatalogLoading(true);
    try {
      // Trigger a sync (best-effort) then load from DB.
      void syncCatalog();
      const balls = await getAllCatalog();
      setCatalogBalls(balls);
    } finally {
      setCatalogLoading(false);
    }
  }

  function pickFromCatalog(catalogBall: CatalogBall) {
    setShowCatalogPicker(false);
    setEditingId(null);
    setForm({
      name: `${catalogBall.brand} ${catalogBall.name}`,
      is_spare_ball: false,
      layout: "",
      notes: ""
    });
    setFormError("");
    // Store catalog ref and snapshot for addBall call via formCatalogRef.
    setFormCatalogRef(catalogBall);
    setShowForm(true);
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
      const payload: Omit<Ball, "id"> = {
        name,
        is_spare_ball: form.is_spare_ball,
        layout: form.layout.trim() || undefined,
        notes: form.notes.trim() || undefined,
        ...(formCatalogRef
          ? {
              catalog_ref_id: formCatalogRef.id,
              catalog_snapshot: {
                brand: formCatalogRef.brand,
                name: formCatalogRef.name,
                coverstockCategory: formCatalogRef.coverstockCategory,
                coreName: formCatalogRef.coreName,
                rg: formCatalogRef.rg,
                diff: formCatalogRef.diff,
                mbDiff: formCatalogRef.mbDiff,
                imageThumb: formCatalogRef.imageThumb,
              },
            }
          : {}),
      };

      if (editingId !== null) {
        await updateBall(editingId, payload);
      } else {
        await addBall(payload);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setFormCatalogRef(null);
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
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold text-slate-950">Arsenal</h1>
        {onOpenCatalog && !showForm && !showCatalogPicker && (
          <button
            type="button"
            onClick={onOpenCatalog}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <BookOpen size={14} aria-hidden="true" />
            Browse catalog
          </button>
        )}
        {!showForm && !showCatalogPicker && (
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
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-slate-950">
              {editingId !== null ? "Edit ball" : "Add ball"}
            </h2>
            {editingId === null && (
              <button
                type="button"
                onClick={() => void openCatalogPicker()}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <BookOpen size={12} aria-hidden="true" />
                Add from catalog
              </button>
            )}
          </div>
          {formCatalogRef && (
            <p className="mb-2 text-xs text-felt-700 font-semibold">
              Prefilled from catalog: {formCatalogRef.brand} {formCatalogRef.name}
            </p>
          )}

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

      {/* Catalog picker panel */}
      {showCatalogPicker && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-slate-950">Pick from catalog</h2>
            <button
              type="button"
              onClick={() => setShowCatalogPicker(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close catalog picker"
            >
              ✕
            </button>
          </div>
          <input
            type="search"
            placeholder="Search name, brand…"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            className="mb-3 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
          />
          {catalogLoading ? (
            <p className="text-sm text-slate-500">Loading catalog…</p>
          ) : catalogBalls.length === 0 ? (
            <p className="text-sm text-slate-500">No catalog balls found. Try refreshing the catalog.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {catalogBalls
                .filter((b) => {
                  const q = catalogSearch.toLowerCase().trim();
                  if (!q) return true;
                  return [b.name, b.brand, b.coverstockRaw].join(" ").toLowerCase().includes(q);
                })
                .map((catalogBall) => (
                  <li key={catalogBall.id}>
                    <button
                      type="button"
                      onClick={() => pickFromCatalog(catalogBall)}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-left hover:border-felt-700 hover:bg-white"
                    >
                      <div className="h-10 w-10 shrink-0">
                        <CatalogBallImage src={catalogBall.imageThumb} alt={catalogBall.name} brand={catalogBall.brand} size="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-500">{catalogBall.brand}</p>
                        <p className="text-sm font-semibold text-slate-950">{catalogBall.name}</p>
                        <p className="text-xs text-slate-500">
                          {catalogBall.coverstockCategory ?? "—"} · {catalogBall.coreType ?? "—"}
                          {catalogBall.rg !== null ? ` · RG ${catalogBall.rg.toFixed(2)}` : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          )}
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
