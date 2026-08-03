import { Plus } from "lucide-react";
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
import { ErrorBanner } from "../components/ErrorBanner";
import { MiniPins } from "../components/MiniPins";
import { SpareLineFormDialog } from "../components/SpareLineFormDialog";
import { IconButton } from "../components/ui/IconButton";
import { useDriftModel } from "../lib/driftModelContext";
import { deriveLaydown, deriveSlide, type DriftModel } from "../lib/driftModel";
import {
  deleteSpareLine,
  ensureDefaultSpareLines,
  getSpareLinesAll,
  reorderSpareLines,
} from "../services/ballRepository";
import type { LineSpec, SpareLine } from "../types/bowling";

/** Slide → laydown, derived from the stance (ADR-030). Read-only, so it sits
 *  under the entered boards in a lighter weight. */
function DerivedChain({ line, model }: { line: LineSpec; model: DriftModel }) {
  const slide = line.stance != null ? deriveSlide(line.stance, model) : undefined;
  const laydown = line.laydown ?? (line.stance != null ? deriveLaydown(line.stance, model) : undefined);
  if (slide == null && laydown == null) return null;
  return (
    <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-tight text-ink-secondary tabular-nums">
      {slide != null && `Slide ${slide}`}
      {slide != null && laydown != null && <span aria-hidden="true" className="text-ink-tertiary"> → </span>}
      {laydown != null && `Laydown ${laydown}`}
    </div>
  );
}

interface SortableSpareCardProps {
  sl: SpareLine;
  /** Tap: straight to the lane visualizer — the card already shows the boards. */
  onOpen: (sl: SpareLine) => void;
}

function SortableSpareCard({ sl, onOpen }: SortableSpareCardProps) {
  const driftModel = useDriftModel();
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
        className={`relative flex w-full select-none flex-col items-center gap-1.5 rounded-lg border bg-surface p-3 text-center shadow-sm ${
          isDragging ? "border-accent-fill opacity-90 shadow-md" : "border-edge"
        }`}
      >
        {/* The whole card is the drag handle: a hold picks it up, a tap opens
            the editor. The lane view moved behind the eye button inside that
            editor, where "tap to edit" is the obvious meaning of a tap. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(sl)}
          aria-label={`Edit spare line for pins ${sl.pins.join(", ")}`}
          className="flex w-full touch-none flex-col items-center gap-1.5 active:opacity-70"
        >
          <MiniPins standing={sl.pins} size="md" />
          {sl.line ? (
            <div className="w-full">
              {/* The two boards you act on. Laydown is derived from the stance,
                  so it reads underneath with the slide rather than as a third
                  column competing with them. */}
              <div className="grid grid-cols-2">
                {([["Stand", sl.line.stance], ["Arrow", sl.line.target]] as const).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{k}</div>
                    <div className="text-xs font-bold tabular-nums text-ink-strong">{v ?? "-"}</div>
                  </div>
                ))}
              </div>
              <DerivedChain line={sl.line} model={driftModel} />
            </div>
          ) : (
            <span className="block text-xs text-ink-secondary">No line</span>
          )}
        </button>
      </div>
    </li>
  );
}

type Editing = { mode: "add" } | { mode: "edit"; sl: SpareLine };

export function SpareLinesView() {
  const [spareLines, setSpareLines] = useState<SpareLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

  // Press-and-hold anywhere on a card to pick it up; a quick tap opens the lane.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;

    // Held but never moved: nothing to reorder, and a tap already opens the
    // editor, so this is a no-op rather than a second way in.
    if (Math.hypot(delta.x, delta.y) < 6) return;

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

  async function handleDelete(id: number) {
    setError("");
    try {
      await deleteSpareLine(id);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spare line.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Spare Lines</h1>
        <IconButton onClick={() => setEditing({ mode: "add" })} label="Add spare">
          <Plus size={18} aria-hidden="true" />
        </IconButton>
      </div>

      {error && (
        <ErrorBanner className="mb-3">{error}</ErrorBanner>
      )}

      {editing?.mode === "add" && (
        <SpareLineFormDialog
          key="add"
          initialPins={[]}
          lockPins={false}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing?.mode === "edit" && (
        <SpareLineFormDialog
          key={`edit-${editing.sl.id}`}
          initialPins={editing.sl.pins}
          lockPins={false}
          initialLine={editing.sl.line}
          initialNotes={editing.sl.notes}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
          onDelete={editing.sl.id != null ? () => void handleDelete(editing.sl.id!) : undefined}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : spareLines.length === 0 ? (
        <p className="text-sm text-ink-secondary">No spare lines yet.</p>
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
            <ul className="grid grid-cols-3 gap-2">
              {spareLines.map((sl) => (
                <SortableSpareCard key={sl.id} sl={sl} onOpen={(line) => setEditing({ mode: "edit", sl: line })} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

    </section>
  );
}
