import { ChevronRight, Plus, X } from "lucide-react";
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
  upsertSpareLine,
} from "../services/ballRepository";
import { getSessionHistory, getSetting, setSetting } from "../services/bowlingRepository";
import { calculateCommonLeaves, type LeaveStats } from "../lib/stats";
import {
  leaveKey,
  matchesFilters,
  mostLeftWithoutLine,
  SPARE_FILTERS,
  stackByLine,
  suggestLineCopies,
  suggestionKey,
  type LineSuggestion,
  type SpareFilter,
} from "../lib/spareLines";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
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

interface SortableStackCardProps {
  /** The stack's id for dragging: its first leave's, filtered or not. */
  id: number;
  /** The leaves shown in this tile: one, or several sharing the same line. */
  stack: SpareLine[];
  onOpen: (sl: SpareLine) => void;
}

/**
 * A tile for one leave, or for a stack of leaves thrown with the same line.
 * A stack shows one deck at a time and a count to flip through the rest: the
 * boards are the same for every leave in it, so only the deck changes. A tap
 * opens the leave on top, and the boards in there are that leave's own.
 */
function SortableStackCard({ id, stack, onOpen }: SortableStackCardProps) {
  const driftModel = useDriftModel();
  const [shown, setShown] = useState(0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  // A filter can shrink the stack under the index.
  const index = shown < stack.length ? shown : 0;
  const sl = stack[index];
  const stacked = stack.length > 1;
  return (
    <li ref={setNodeRef} style={style} className="relative">
      {/* The card edge peeking out underneath is what says "more than one". */}
      {stacked && (
        <div
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-1.5 top-1 rounded-lg border border-edge-strong bg-surface-muted"
        />
      )}
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
                    <div className="text-[10px] font-semibold uppercase tracking-tight text-ink-secondary">{k}</div>
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
        {stacked && (
          <button
            type="button"
            onClick={() => setShown((index + 1) % stack.length)}
            aria-label={`Next leave with this line, ${index + 1} of ${stack.length}`}
            className={`relative -mb-1 flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent active:opacity-70 ${TAP_TARGET_44}`}
          >
            {index + 1} of {stack.length}
            <ChevronRight size={12} strokeWidth={3} aria-hidden="true" />
          </button>
        )}
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

/** Suggestions the bowler turned down, so the same one is not asked again. */
const DISMISSED_KEY = "spareLineSuggestionsDismissed";

function parseDismissed(raw: string | undefined): Set<string> {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

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

  const [filters, setFilters] = useState<ReadonlySet<SpareFilter>>(new Set());
  const dismissedRaw = useLiveQuery(async () => ({ raw: await getSetting(DISMISSED_KEY) }));
  const dismissed = parseDismissed(dismissedRaw?.raw);

  // At most one of each ask on screen: a line to copy, then a leave to write.
  const suggestion: LineSuggestion | undefined =
    isLoading || !dismissedRaw ? undefined : suggestLineCopies(leaves, spareLines, dismissed)[0];
  const mostLeft = isLoading ? undefined : mostLeftWithoutLine(leaves, spareLines);
  const ask =
    mostLeft && (!suggestion || leaveKey(mostLeft.pins) !== leaveKey(suggestion.pins))
      ? mostLeft
      : undefined;

  // Stacked within each group, so a stack never spans two headings.
  const stacks = SPARE_GROUPS.map((group) => ({
    group,
    stacks: stackByLine(spareLines.filter((sl) => spareGroup(sl.pins) === group)),
  }));

  function toggleFilter(f: SpareFilter) {
    setFilters((curr) => {
      const next = new Set(curr);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  async function acceptSuggestion(s: LineSuggestion) {
    setError("");
    // The boards and the strike-ball move travel; the leave keeps its own note.
    const existing = spareLines.find((sl) => leaveKey(sl.pins) === leaveKey(s.pins));
    try {
      await upsertSpareLine(
        s.pins,
        { ...(s.from.line?.stance != null && { stance: s.from.line.stance }),
          ...(s.from.line?.target != null && { target: s.from.line.target }) },
        existing?.notes,
        s.from.strike_offset
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy the line.");
    }
  }

  async function dismissSuggestion(s: LineSuggestion) {
    const next = new Set(dismissed);
    next.add(suggestionKey(s));
    await setSetting(DISMISSED_KEY, JSON.stringify([...next]));
  }

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

    // A stack moves whole: it is dragged by its first leave's id.
    const tiles = stacks.flatMap((g) => g.stacks);
    const oldIndex = tiles.findIndex((t) => t[0].id === active.id);
    const newIndex = tiles.findIndex((t) => t[0].id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Order is kept within a group: a leave dropped on another group's card
    // would move in the list and stay where it was on screen.
    if (spareGroup(tiles[oldIndex][0].pins) !== spareGroup(tiles[newIndex][0].pins)) return;

    const next = arrayMove(tiles, oldIndex, newIndex).flat();
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

      {/* A leave with no line that is the same shot as one with a line: one
          tap copies it, and the two then stack on one tile. */}
      {suggestion && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-edge-strong bg-surface p-3">
          <MiniPins standing={suggestion.pins} size="sm" />
          <p className="min-w-0 flex-1 text-xs text-ink-secondary">
            <span className="font-semibold text-ink">{formatLeave(suggestion.pins)}</span> is
            likely the same shot as{" "}
            <span className="font-semibold text-ink">{formatLeave(suggestion.from.pins)}</span>.
            Use its line?
          </p>
          <button
            type="button"
            onClick={() => void acceptSuggestion(suggestion)}
            className={`relative shrink-0 text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
          >
            Use line
          </button>
          <IconButton
            compact
            label="Not the same shot"
            onClick={() => void dismissSuggestion(suggestion)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
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
        <>
        {/* Filters to cut a long list down. "All" is on while nothing else is,
            and clears the rest. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter spare lines">
          <Chip selected={filters.size === 0} onClick={() => setFilters(new Set())}>
            All
          </Chip>
          {SPARE_FILTERS.map((f) => (
            <Chip key={f.id} selected={filters.has(f.id)} onClick={() => toggleFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {(() => {
          const shown = stacks
            .map((g) => ({
              group: g.group,
              tiles: g.stacks
                .map((stack) => ({ id: stack[0].id!, members: stack.filter((sl) => matchesFilters(sl, filters)) }))
                .filter((t) => t.members.length > 0),
            }))
            .filter((g) => g.tiles.length > 0);
          if (shown.length === 0) {
            return (
              <EmptyState
                icon={SpareLineIcon}
                title="Nothing matches"
                description="None of your saved leaves fit these filters."
              >
                <Button variant="ghost" onClick={() => setFilters(new Set())}>
                  Clear filters
                </Button>
              </EmptyState>
            );
          }
          return (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void handleDragEnd(e)}
            >
              {/* The same three groups as Stats, easiest first, so a leave sits
                  in the same place on both screens. */}
              {shown.map(({ group, tiles }) => (
                <section key={group} aria-label={SPARE_GROUP_LABEL[group]}>
                  <h2 className={`mb-1 px-1 ${GROUP_HEADING}`}>{SPARE_GROUP_LABEL[group]}</h2>
                  <SortableContext items={tiles.map((t) => t.id)} strategy={rectSortingStrategy}>
                    <ul className="grid grid-cols-3 gap-2">
                      {tiles.map((t) => (
                        <SortableStackCard
                          key={t.id}
                          id={t.id}
                          stack={t.members}
                          onOpen={(line) => setOpened({ pins: line.pins, edit: false })}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </section>
              ))}
            </DndContext>
          );
        })()}
        </>
      )}
    </section>
    </PushScreen>
  );
}
