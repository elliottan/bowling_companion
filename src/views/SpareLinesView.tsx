import { GripVertical } from "lucide-react";
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
import { SpareLineFormDialog } from "../components/SpareLineFormDialog";
import { derivePinBoard } from "../lib/pinGeometry";
import {
  deleteSpareLine,
  ensureDefaultSpareLines,
  getSpareLinesAll,
  reorderSpareLines,
} from "../services/ballRepository";
import type { PinNumber, SpareLine } from "../types/bowling";

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
              S{sl.line.stance ?? "·"} · L{sl.line.laydown ?? "·"} · T{sl.line.target ?? "·"} · B{sl.line.breakpoint ?? "·"}
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

type Editing = { mode: "add" } | { mode: "edit"; sl: SpareLine };

export function SpareLinesView() {
  const [spareLines, setSpareLines] = useState<SpareLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

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
          lockPins
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
                <SortableSpareCard key={sl.id} sl={sl} onEdit={(s) => setEditing({ mode: "edit", sl: s })} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
