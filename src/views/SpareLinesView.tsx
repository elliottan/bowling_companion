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
import { LaneVisualizer } from "../components/LaneVisualizer";
import { SpareLineFormDialog } from "../components/SpareLineFormDialog";
import { useDriftModel } from "../lib/driftModelContext";
import { describePinsStanding } from "../lib/pins";
import { deriveLaydown, deriveSlide, syncStanceLaydown, type DriftModel } from "../lib/driftModel";
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
    <div
      className="flex flex-col items-center gap-0.5"
      role="img"
      aria-label={describePinsStanding(standing)}
    >
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

/** Slide → laydown, derived from the stance (ADR-030). Read-only, so it sits
 *  under the entered boards in a lighter weight. */
function DerivedChain({ line, model }: { line: LineSpec; model: DriftModel }) {
  const slide = line.stance != null ? deriveSlide(line.stance, model) : undefined;
  const laydown = line.laydown ?? (line.stance != null ? deriveLaydown(line.stance, model) : undefined);
  if (slide == null && laydown == null) return null;
  return (
    <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-tight text-ink-secondary tabular-nums">
      {slide != null && `Slide ${slide}`}
      {slide != null && laydown != null && <span aria-hidden="true" className="text-slate-300"> → </span>}
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
        className={`relative flex w-full select-none flex-col items-center gap-1.5 rounded-lg border bg-white p-3 text-center shadow-sm ${
          isDragging ? "border-felt-700 opacity-90 shadow-md" : "border-slate-200"
        }`}
      >
        {/* The whole card is the drag handle: a hold picks it up, a tap opens
            the lane. Holding without moving ends as a no-move drag, which the
            view turns into the edit/delete menu. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(sl)}
          aria-label={`Open lane view for pins ${sl.pins.join(", ")}`}
          className="flex w-full touch-none flex-col items-center gap-1.5 active:opacity-70"
        >
          <SmallPinDiagram standing={sl.pins} />
          {sl.line ? (
            <div className="w-full">
              {/* The two boards you act on. Laydown is derived from the stance,
                  so it reads underneath with the slide rather than as a third
                  column competing with them. */}
              <div className="grid grid-cols-2">
                {([["Stand", sl.line.stance], ["Arrow", sl.line.target]] as const).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{k}</div>
                    <div className="text-xs font-bold tabular-nums text-slate-700">{v ?? "—"}</div>
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
  // Tapping a card goes straight to the lane. The line is held here while it is
  // being dragged and written back once, on close.
  const [viewing, setViewing] = useState<SpareLine | null>(null);
  const [vizLine, setVizLine] = useState<LineSpec>({});
  const driftModel = useDriftModel();

  function openViz(sl: SpareLine) {
    setVizLine(sl.line ?? {});
    setViewing(sl);
  }

  async function closeViz() {
    const sl = viewing;
    setViewing(null);
    if (!sl) return;
    const hasLine = Object.values(vizLine).some((v) => v != null);
    try {
      // The whole solved spec is stored, hook timing included — the visualizer
      // is the only place those are set, so dropping them here would lose them.
      await upsertSpareLine(sl.pins, hasLine ? vizLine : undefined, sl.notes);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save spare line.");
    }
  }

  // Press-and-hold anywhere on a card to pick it up; a quick tap opens the lane.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;

    // Held but never moved: that is the long-press gesture — open the card's
    // details (pins + delete) instead of reordering.
    if (Math.hypot(delta.x, delta.y) < 6) {
      const sl = spareLines.find((s) => s.id === active.id);
      if (sl) setEditing({ mode: "edit", sl });
      return;
    }

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
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-950">Spare Lines</h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: "add" })}
          aria-label="Add spare"
          className="text-2xl leading-none text-slate-500 hover:text-slate-800 px-1"
        >
          +
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
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
            <ul className="grid grid-cols-3 gap-2">
              {spareLines.map((sl) => (
                <SortableSpareCard key={sl.id} sl={sl} onOpen={openViz} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {viewing && (
        <LaneVisualizer
          key={`viz-${viewing.id}`}
          title={`Pins ${viewing.pins.join(", ")}`}
          line={vizLine}
          leave={viewing.pins}
          spare
          showStance
          onChange={(l) => setVizLine(syncStanceLaydown(vizLine, l ?? {}, driftModel))}
          onClose={() => void closeViz()}
        />
      )}
    </section>
  );
}
