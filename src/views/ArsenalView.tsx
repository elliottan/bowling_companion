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
import { BookOpen, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import {
  addBall,
  deleteBall,
  getBalls,
  reorderBalls,
  updateBall,
} from "../services/ballRepository";
import {
  getAllCatalog,
  getCatalogBall,
  syncCatalog,
} from "../services/ballCatalogRepository";
import { useOverlay } from "../lib/useOverlay";
import type { Ball } from "../types/bowling";
import type { CatalogBall, Manufacturer } from "../types/catalog";
import { DEFAULT_WEIGHT } from "../types/catalog";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { ErrorBanner } from "../components/ErrorBanner";

const EMPTY_FORM = {
  name: "",
  is_spare_ball: false,
  layout: "",
  notes: "",
  weight: DEFAULT_WEIGHT as number,
};

type FormState = typeof EMPTY_FORM;

const WEIGHT_OPTIONS = [10, 11, 12, 13, 14, 15, 16];

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

  const snap = ball.catalog_snapshot;

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`flex items-start gap-2 rounded-lg border bg-surface p-4 shadow-sm ${
          isDragging ? "border-accent-fill opacity-90 shadow-md" : "border-edge"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${ball.name}`}
          className="mt-0.5 touch-none shrink-0 text-ink-tertiary hover:text-ink-secondary"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>

        {/* Catalog ball image (when linked to a catalog entry) */}
        {snap && (
          <div className="h-12 w-12 shrink-0">
            <CatalogBallImage
              src={snap.imageThumb}
              alt={ball.name}
              brand={snap.brand as Manufacturer}
              size="thumb"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{ball.name}</span>
            {ball.is_spare_ball && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Spare ball
              </span>
            )}
          </div>
          {/* B9: catalog specs line */}
          {snap && (
            <p className="mt-0.5 text-xs text-ink-secondary">
              {[
                snap.coverstockCategory,
                snap.coreName,
                snap.rg !== null ? `RG ${snap.rg.toFixed(2)}` : null,
                snap.diff !== null ? `Diff ${snap.diff.toFixed(3)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {ball.layout && (
            <p className="mt-0.5 text-xs text-ink-secondary">{ball.layout}</p>
          )}
          {ball.notes && (
            <p className="mt-1 text-sm text-ink-secondary">{ball.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <IconButton onClick={() => onEdit(ball)} label={`Edit ${ball.name}`}>
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
          <IconButton variant="danger" onClick={() => onDelete(ball.id!)} label={`Delete ${ball.name}`}>
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
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
  // Specs for the currently selected weight (B11)
  const [weightSpecs, setWeightSpecs] = useState<{ rg: number | null; diff: number | null; mbDiff: number | null } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const catalogPickerRef = useOverlay<HTMLDivElement>(
    () => setShowCatalogPicker(false),
    showCatalogPicker
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

  // B11: When catalog ref or weight changes, resolve specs for that weight.
  useEffect(() => {
    if (!formCatalogRef) {
      setWeightSpecs(null);
      return;
    }
    const w = form.weight;
    void getCatalogBall(formCatalogRef.id).then((catalogBall) => {
      if (!catalogBall) {
        setWeightSpecs(null);
        return;
      }
      const entry = catalogBall.weights?.find((ws) => ws.weight === w);
      if (entry) {
        setWeightSpecs({ rg: entry.rg, diff: entry.diff, mbDiff: entry.mbDiff });
      } else {
        // Fall back to top-level (15 lb default)
        setWeightSpecs({ rg: catalogBall.rg, diff: catalogBall.diff, mbDiff: catalogBall.mbDiff });
      }
    });
  }, [formCatalogRef, form.weight]);

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
    setWeightSpecs(null);
    setShowForm(true);
  }

  function openEditForm(ball: Ball) {
    setEditingId(ball.id ?? null);
    setForm({
      name: ball.name,
      is_spare_ball: ball.is_spare_ball,
      layout: ball.layout ?? "",
      notes: ball.notes ?? "",
      weight: ball.weight ?? DEFAULT_WEIGHT,
    });
    setFormError("");
    setWeightSpecs(null);
    setShowForm(true);
    // Restore catalog link (if any) so weight specs + catalog image resolve.
    if (ball.catalog_ref_id) {
      void getCatalogBall(ball.catalog_ref_id).then((cb) => setFormCatalogRef(cb ?? null));
    } else {
      setFormCatalogRef(null);
    }
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormCatalogRef(null);
    setWeightSpecs(null);
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
    // Editing an existing ball: just attach the catalog link, keep its other fields.
    // Adding a new ball: prefill the name from the catalog entry.
    if (editingId === null) {
      setForm({
        name: `${catalogBall.brand} ${catalogBall.name}`,
        is_spare_ball: false,
        layout: "",
        notes: "",
        weight: DEFAULT_WEIGHT,
      });
    }
    setFormError("");
    // Store catalog ref and snapshot for the add/update call via formCatalogRef.
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
      // Use weight-specific specs if available, else fall back to catalog top-level
      const specOverride = weightSpecs && formCatalogRef ? {
        rg: weightSpecs.rg,
        diff: weightSpecs.diff,
        mbDiff: weightSpecs.mbDiff,
      } : null;

      const payload: Omit<Ball, "id"> = {
        name,
        is_spare_ball: form.is_spare_ball,
        layout: form.layout.trim() || undefined,
        notes: form.notes.trim() || undefined,
        weight: form.weight,
        ...(formCatalogRef
          ? {
              catalog_ref_id: formCatalogRef.id,
              catalog_snapshot: {
                brand: formCatalogRef.brand,
                name: formCatalogRef.name,
                coverstockCategory: formCatalogRef.coverstockCategory,
                coreName: formCatalogRef.coreName,
                rg: specOverride?.rg ?? formCatalogRef.rg,
                diff: specOverride?.diff ?? formCatalogRef.diff,
                mbDiff: specOverride?.mbDiff ?? formCatalogRef.mbDiff,
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
      setWeightSpecs(null);
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
        <h1 className="flex-1 text-xl font-bold text-ink">Arsenal</h1>
        {/* B10: icon-only browse catalog button */}
        {onOpenCatalog && !showForm && !showCatalogPicker && (
          <IconButton onClick={onOpenCatalog} label="Browse catalog">
            <BookOpen size={14} aria-hidden="true" />
          </IconButton>
        )}
        {!showForm && !showCatalogPicker && (
          <IconButton onClick={openAddForm} label="Add ball">
            <Plus size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {error && (
        <ErrorBanner className="mb-3">{error}</ErrorBanner>
      )}

      {showForm && (
        <div className="mb-4 rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-ink">
              {editingId !== null ? "Edit ball" : "Add ball"}
            </h2>
            <Button variant="secondary" onClick={() => void openCatalogPicker()}>
              <BookOpen size={12} aria-hidden="true" />
              {editingId !== null
                ? formCatalogRef
                  ? "Change catalog link"
                  : "Link to catalog"
                : "Add from catalog"}
            </Button>
          </div>
          {formCatalogRef && (
            <p className="mb-2 text-xs text-accent font-semibold">
              {editingId !== null ? "Linked to catalog" : "Prefilled from catalog"}: {formCatalogRef.brand} {formCatalogRef.name}
            </p>
          )}

          {formError && (
            <ErrorBanner className="mb-3">{formError}</ErrorBanner>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-strong">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Storm Phaze II"
                className="h-11 w-full rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              />
            </div>

            {/* B11: weight selector */}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-strong">
                Weight <span className="text-ink-secondary font-normal">(lbs)</span>
              </label>
              <select
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              >
                {WEIGHT_OPTIONS.map((w) => (
                  <option key={w} value={w}>{w} lb</option>
                ))}
              </select>
              {/* Show weight-specific specs when catalog-linked */}
              {formCatalogRef && weightSpecs && (
                <p className="mt-1 text-xs text-ink-secondary">
                  Specs for {form.weight} lb:
                  {weightSpecs.rg !== null ? ` RG ${weightSpecs.rg.toFixed(2)}` : ""}
                  {weightSpecs.diff !== null ? ` · Diff ${weightSpecs.diff.toFixed(3)}` : ""}
                  {weightSpecs.mbDiff !== null ? ` · MB Diff ${weightSpecs.mbDiff.toFixed(3)}` : ""}
                  {weightSpecs.rg === null && weightSpecs.diff === null ? " — (15 lb fallback)" : ""}
                </p>
              )}
            </div>

            <div className="flex items-start gap-3">
              <input
                id="is_spare_ball"
                type="checkbox"
                checked={form.is_spare_ball}
                onChange={(e) =>
                  setForm((f) => ({ ...f, is_spare_ball: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-edge-strong accent-[rgb(var(--color-accent-fill))]"
              />
              <div>
                <label
                  htmlFor="is_spare_ball"
                  className="text-sm font-medium text-ink-strong"
                >
                  Spare ball
                </label>
                <p className="text-xs text-ink-secondary">
                  Auto-selected for spare shots. Only one ball can be marked as spare ball.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink-strong">
                Layout <span className="text-ink-secondary font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.layout}
                onChange={(e) => setForm((f) => ({ ...f, layout: e.target.value }))}
                placeholder='e.g. 45° × 4-1/2″ × 35°'
                className="h-11 w-full rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink-strong">
                Notes <span className="text-ink-secondary font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Any notes about this ball…"
                className="w-full rounded-lg border border-edge-strong px-3 py-2 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? "Saving…" : editingId !== null ? "Save ball" : "Add ball"}
              </Button>
              <Button variant="secondary" onClick={cancelForm} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog picker panel */}
      {showCatalogPicker && (
        <div
          ref={catalogPickerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Pick from catalog"
          className="mb-4 rounded-lg border border-edge bg-surface p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-ink">Pick from catalog</h2>
            <IconButton onClick={() => setShowCatalogPicker(false)} label="Close catalog picker">
              ✕
            </IconButton>
          </div>
          <input
            type="search"
            placeholder="Search name, brand…"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            className="mb-3 h-9 w-full rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
          />
          {catalogLoading ? (
            <p className="text-sm text-ink-secondary">Loading catalog…</p>
          ) : catalogBalls.length === 0 ? (
            <p className="text-sm text-ink-secondary">No catalog balls found. Try refreshing the catalog.</p>
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
                      className="flex w-full items-center gap-3 rounded-lg border border-edge bg-surface-muted p-2 text-left hover:border-accent-fill hover:bg-surface"
                    >
                      <div className="h-10 w-10 shrink-0">
                        <CatalogBallImage src={catalogBall.imageThumb} alt={catalogBall.name} brand={catalogBall.brand} size="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-secondary">{catalogBall.brand}</p>
                        <p className="text-sm font-semibold text-ink">{catalogBall.name}</p>
                        <p className="text-xs text-ink-secondary">
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
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : balls.length === 0 ? (
        <p className="text-sm text-ink-secondary">
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
