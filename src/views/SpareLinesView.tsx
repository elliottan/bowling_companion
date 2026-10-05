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
import { SpareDetailsSheet } from "../components/SpareDetailsSheet";
import { IconButton } from "../components/ui/IconButton";
import { PushScreen } from "../components/PushScreen";
import { useDriftModel } from "../lib/driftModelContext";
import { deriveLaydown, deriveSlide, type DriftModel } from "../lib/driftModel";
import {
  ensureDefaultSpareLines,
  getSpareLinesAll,
  reorderSpareLines,
} from "../services/ballRepository";
import { getSessionHistory } from "../services/bowlingRepository";
import { calculateCommonLeaves, mostLeftWithoutLine, type LeaveStats } from "../lib/stats";
import {
  formatLeave,
  SPARE_GROUP_LABEL,
  SPARE_GROUPS,
  spareGroup,
} from "../lib/pins";
import { GROUP_HEADING } from "../components/ui/typography";
import type { LineSpec, PinNumber, SpareLine } from "../types/bowling";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { SpareLineIcon } from "../components/icons";

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
  /** Tap: straight to the lane visualizer, the card already shows the boards. */
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
            the leave's details. The lane view is behind the eye in there. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(sl)}
          aria-label={`Open spare line for pins ${sl.pins.join(", ")}`}
          className="flex w-full touch-none flex-col items-center gap-1.5 active:opacity-70"
        >
          <MiniPins standing={sl.pins} size="md" />
          {sl.line ? (
            <div className="w-full">
              {/* The two boards you act on. Laydown is derived from the stance,
                  so it reads underneath with the slide rather than as a third
                  column competing with them. */}
              <div className="grid grid-cols-2">
                {([["Stance", sl.line.stance], ["Target", sl.line.target]] as const).map(([k, v]) => (
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
    offset.stance != null ? `${part(offset.stance)} stance` : null,
    offset.target != null ? `${part(offset.target)} target` : null
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

/** What the details sheet is showing: a leave, or a new one being added. */
type Opened = { pins: PinNumber[]; edit: boolean };

const NO_LEAVES: LeaveStats[] = [];

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
  // Every leave across every session: what the details sheet shows beside the
  // deck, and what the hint ranks by.
  const leaves = useLiveQuery(async () => calculateCommonLeaves(await getSessionHistory())) ?? NO_LEAVES;
  // Reordering shows the new order while the write lands.
  const [reordered, setReordered] = useState<SpareLine[] | null>(null);
  const spareLines = reordered ?? live ?? NO_LINES;
  const isLoading = live === undefined;
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);

  const ask = isLoading ? undefined : mostLeftWithoutLine(leaves, spareLines);

  // Press-and-hold anywhere on a card to pick it up; a quick tap opens it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;

    // Held but never moved: nothing to reorder, and a tap already opens the
    // leave, so this is a no-op rather than a second way in.
    if (Math.hypot(delta.x, delta.y) < 6) return;

    if (!over || active.id === over.id) return;

    const oldIndex = spareLines.findIndex((s) => s.id === active.id);
    const newIndex = spareLines.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Order is kept within a group: a leave dropped on another group's card
    // would move in the list and stay where it was on screen.
    if (spareGroup(spareLines[oldIndex].pins) !== spareGroup(spareLines[newIndex].pins)) return;

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

  return (
    // A pushed screen, not a tab, since Stats took the tab slot (ADR-057). The
    // add action moves with it: a push has a nav bar, and that bar carries the
    // one trailing action instead of a Fab (DESIGN-LANGUAGE §7b).
    <PushScreen
      title="Spare lines"
      onBack={onBack}
      active={opened === null}
      trailing={
        <IconButton
          label="Add spare line"
          variant="round"
          onClick={() => setOpened({ pins: [], edit: true })}
        >
          <Plus size={20} aria-hidden="true" />
        </IconButton>
      }
    >
    <section className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-3 sm:px-6">
      {error && (
        <ErrorBanner>{error}</ErrorBanner>
      )}

      {opened && (
        <SpareDetailsSheet
          pins={opened.pins}
          leaves={leaves}
          edit={opened.edit}
          onClose={() => setOpened(null)}
        />
      )}

      {/* The one leave worth writing down next: the one left most often that
          has no line. It moves on to the next as soon as this one has one. */}
      {ask && (
        <button
          type="button"
          onClick={() => setOpened({ pins: ask.pins, edit: true })}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-edge-strong bg-surface p-3 text-left active:bg-surface-muted"
        >
          <MiniPins standing={ask.pins} size="sm" />
          <span className="min-w-0 flex-1 text-xs text-ink-secondary">
            You leave{" "}
            <span className="font-semibold text-ink">{formatLeave(ask.pins)}</span> most
            often ({ask.attempts} {ask.attempts === 1 ? "time" : "times"}) and have no line
            for it.
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent">Add line</span>
        </button>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : spareLines.length === 0 ? (
        <EmptyState
          icon={SpareLineIcon}
          title="No spare lines yet"
          description="Save where you stand and where you aim for a leave, and it is there the next time you face it."
        >
          <Button variant="primary" onClick={() => setOpened({ pins: [], edit: true })}>
            <Plus size={18} aria-hidden="true" />
            Add spare line
          </Button>
        </EmptyState>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          {/* The same three groups as Stats, easiest first, so a leave sits
              in the same place on both screens. */}
          {SPARE_GROUPS.map((group) => {
            const inGroup = spareLines.filter((sl) => spareGroup(sl.pins) === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} aria-label={SPARE_GROUP_LABEL[group]}>
                <h2 className={`mb-1 px-1 ${GROUP_HEADING}`}>{SPARE_GROUP_LABEL[group]}</h2>
                <SortableContext items={inGroup.map((s) => s.id!)} strategy={rectSortingStrategy}>
                  <ul className="grid grid-cols-3 gap-2">
                    {inGroup.map((sl) => (
                      <SortableSpareCard
                        key={sl.id}
                        sl={sl}
                        onOpen={(line) => setOpened({ pins: line.pins, edit: false })}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </section>
            );
          })}
        </DndContext>
      )}
    </section>
    </PushScreen>
  );
}
