import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
import { PushScreen } from "../components/PushScreen";
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
          <StrikeMove offset={sl.strike_offset} />
        </button>
      </div>
    </li>
  );
}

/** The strike-ball move, when one is set. Signed and prefixed, because a bare
 *  "2" beside a card of absolute boards reads as board 2. */
function StrikeMove({ offset }: { offset?: SpareLine["strike_offset"] }) {
  if (!offset || (offset.stance == null && offset.target == null)) return null;
  const part = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const parts = [
    offset.stance != null ? `${part(offset.stance)} stand` : null,
    offset.target != null ? `${part(offset.target)} arrow` : null
  ].filter(Boolean);
  return (
    <span className="block w-full text-[11px] font-semibold tabular-nums text-accent">
      Strike ball {parts.join(", ")}
    </span>
  );
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_LINES: SpareLine[] = [];

type Editing = { mode: "add" } | { mode: "edit"; sl: SpareLine };

export function SpareLinesView({ onBack }: { onBack: () => void }) {
  // Seeding is a write, and a live query observes inside a readonly
  // transaction, so it cannot live in one. Fire it once; the query below picks
  // the rows up on its own when they land.
  useEffect(() => {
    void ensureDefaultSpareLines();
  }, []);

  // Live: saving, deleting and reordering all land through Dexie, so the list
  // follows them without a refresh call at each site.
  const live = useLiveQuery(() => getSpareLinesAll());
  // Reordering shows the new order while the write lands.
  const [reordered, setReordered] = useState<SpareLine[] | null>(null);
  const spareLines = reordered ?? live ?? NO_LINES;
  const isLoading = live === undefined;
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
    setReordered(next);
    setError("");
    try {
      await reorderSpareLines(next.map((s) => s.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order.");
    } finally {
      setReordered(null);
    }
  }

  async function handleDelete(id: number) {
    setError("");
    try {
      await deleteSpareLine(id);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spare line.");
    }
  }

  return (
    // A pushed screen, not a tab, since Stats took the tab slot (ADR-057). The
    // add action moves with it: a push has a nav bar, and that bar carries the
    // one trailing action instead of a Fab (DESIGN-LANGUAGE §7b).
    <PushScreen
      title="Spare lines"
      onBack={onBack}
      active={editing === null}
      trailing={
        <IconButton
          label="Add spare line"
          variant="round"
          onClick={() => setEditing({ mode: "add" })}
        >
          <Plus size={20} aria-hidden="true" />
        </IconButton>
      }
    >
    <section className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
      {error && (
        <ErrorBanner className="mb-3">{error}</ErrorBanner>
      )}

      {editing?.mode === "add" && (
        <SpareLineFormDialog
          key="add"
          initialPins={[]}
          lockPins={false}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing?.mode === "edit" && (
        <SpareLineFormDialog
          key={`edit-${editing.sl.id}`}
          initialPins={editing.sl.pins}
          lockPins={false}
          initialLine={editing.sl.line}
          initialStrikeOffset={editing.sl.strike_offset}
          initialNotes={editing.sl.notes}
          onSaved={() => setEditing(null)}
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
    </PushScreen>
  );
}
