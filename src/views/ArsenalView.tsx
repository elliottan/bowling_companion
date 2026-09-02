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
import { GripVertical, Plus } from "lucide-react";
import { BowlingBallIcon } from "../components/icons";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BallFormDialog } from "../components/BallFormDialog";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { deleteBall, getBalls, reorderBalls } from "../services/ballRepository";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";

interface SortableBallRowProps {
  ball: Ball;
  onEdit: (ball: Ball) => void;
}

/** One arsenal entry. The whole row opens the editor — the old row had an edit
 *  and a delete target crammed beside a drag handle, three ways to mis-tap. */
function SortableBallRow({ ball, onEdit }: SortableBallRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ball.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const snap = ball.catalog_snapshot;
  const specs = snap
    ? [
        snap.coverstockCategory,
        snap.coreName,
        snap.rg !== null ? `RG ${snap.rg.toFixed(2)}` : null,
        snap.diff !== null ? `Diff ${snap.diff.toFixed(3)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1 rounded-xl border bg-surface pr-2 shadow-sm ${
          isDragging ? "border-accent-fill opacity-95 shadow-md" : "border-edge"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${ball.name}`}
          className="inline-flex h-14 w-8 shrink-0 touch-none items-center justify-center text-ink-tertiary"
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onEdit(ball)}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 text-left"
        >
          <div className="h-12 w-12 shrink-0">
            {snap ? (
              <CatalogBallImage
                src={snap.imageThumb}
                alt={ball.name}
                brand={snap.brand as Manufacturer}
                size="thumb"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface-muted text-ink-tertiary">
                <BowlingBallIcon size={22} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-ink">{ball.name}</span>
              {ball.is_spare_ball && (
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                  Spare
                </span>
              )}
            </div>
            {specs && <p className="truncate text-xs text-ink-secondary">{specs}</p>}
            {ball.layout && <p className="truncate text-xs text-ink-secondary">{ball.layout}</p>}
            {ball.notes && <p className="truncate text-xs text-ink-secondary">{ball.notes}</p>}
          </div>
        </button>
      </div>
    </li>
  );
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_BALLS: Ball[] = [];

interface ArsenalViewProps {
  /** Dismiss the pushed screen and return to whatever launched it. */
  onBack: () => void;
}

export function ArsenalView({ onBack }: ArsenalViewProps) {
  // Live: Dexie re-runs this whenever the table changes, so saving, deleting
  // and reordering do not each have to remember to refresh the list.
  const live = useLiveQuery(() => getBalls());
  // Reordering shows the new order while the write lands, or the row would
  // snap back for a frame before the live query caught up.
  const [reordered, setReordered] = useState<Ball[] | null>(null);
  const balls = reordered ?? live ?? NO_BALLS;
  const isLoading = live === undefined;
  const [error, setError] = useState("");

  // null = closed; { ball: null } = adding; { ball } = editing.
  const [form, setForm] = useState<{ ball: Ball | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Ball | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = balls.findIndex((b) => b.id === active.id);
    const newIndex = balls.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(balls, oldIndex, newIndex);
    setReordered(next);
    setError("");
    try {
      await reorderBalls(next.map((b) => b.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order.");
    } finally {
      // Either the write landed and the live query already agrees, or it
      // failed and the stored order is the truth.
      setReordered(null);
    }
  }

  async function handleDelete(ball: Ball) {
    setPendingDelete(null);
    setForm(null);
    setError("");
    try {
      await deleteBall(ball.id!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ball.");
    }
  }

  return (
    <>
      <PushScreen
        title="Arsenal"
        onBack={onBack}
        active={form === null && pendingDelete === null}
        trailing={
          <IconButton onClick={() => setForm({ ball: null })} label="Add ball" variant="round">
            <Plus size={24} aria-hidden="true" />
          </IconButton>
        }
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
          {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

          {isLoading ? (
            <p className="text-sm text-ink-secondary">Loading…</p>
          ) : balls.length === 0 ? (
            <EmptyState
              icon={BowlingBallIcon}
              title="No balls yet"
              description="Add the balls you carry. Link one to the catalog and it brings its core, coverstock and numbers with it."
            >
              <Button variant="primary" size="lg" onClick={() => setForm({ ball: null })}>
                <Plus size={18} aria-hidden="true" />
                Add a ball
              </Button>
            </EmptyState>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void handleDragEnd(e)}
              >
                <SortableContext items={balls.map((b) => b.id!)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {balls.map((ball) => (
                      <SortableBallRow key={ball.id} ball={ball} onEdit={(b) => setForm({ ball: b })} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      </PushScreen>

      {form && (
        <BallFormDialog
          key={form.ball?.id ?? "new"}
          ball={form.ball}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
          onDelete={form.ball ? () => setPendingDelete(form.ball) : undefined}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? "ball"}?`}
        message="Shots already recorded with this ball keep their scores, but lose the ball name."
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
