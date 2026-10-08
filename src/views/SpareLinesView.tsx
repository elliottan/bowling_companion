import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useHandedness } from "../lib/handednessContext";
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
  describeMove,
  hasMove,
  leaveKey,
  matchesFilters,
  mostLeftWithoutLine,
  SPARE_FILTERS,
  spareLinesShown,
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

/** How many grid columns a stack spans: one per leave, up to the row. */
const COLUMNS = 3;
const SPAN = ["", "col-span-1", "col-span-2", "col-span-3"] as const;

/**
 * A tile for one leave, or for a stack of leaves thrown with the same line.
 * A stack is one wider tile: every leave's deck side by side over the one set
 * of boards they share, so "these leaves, this line" is read at a glance with
 * nothing to flip through. Each deck opens its own leave, and the boards in
 * there are that leave's own. The whole tile is the drag handle: a hold picks
 * it up, a tap opens.
 */
function SortableStackCard({ id, stack, onOpen }: SortableStackCardProps) {
  const driftModel = useDriftModel();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  const top = stack[0];
  const stacked = stack.length > 1;
  const span = SPAN[Math.min(stack.length, COLUMNS)];
  const card = `flex h-full w-full select-none flex-col items-center gap-1.5 rounded-lg border bg-surface p-3 text-center shadow-sm ${
    isDragging ? "border-accent-fill opacity-90 shadow-md" : "border-edge"
  }`;
  const boards = (
    <>
      {top.line ? (
        <div className="w-full">
          {/* The two boards you act on. Laydown is derived from the stance,
              so it reads underneath with the slide rather than as a third
              column competing with them. */}
          <div className="grid grid-cols-2">
            {([["Stance", top.line.stance], ["Target", top.line.target]] as const).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] font-semibold uppercase tracking-tight text-ink-secondary">{k}</div>
                <div className="text-xs font-bold tabular-nums text-ink-strong">{v ?? "-"}</div>
              </div>
            ))}
          </div>
          <DerivedChain line={top.line} model={driftModel} />
        </div>
      ) : hasMove(top) ? null : (
        // A leave answered by a strike-ball move alone has a line: the move
        // under the deck is it.
        <span className="block text-xs text-ink-secondary">No line</span>
      )}
    </>
  );

  if (!stacked) {
    return (
      <li ref={setNodeRef} style={style} className="flex">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(top)}
          aria-label={`Open spare line for pins ${top.pins.join(", ")}`}
          className={`${card} touch-none active:opacity-70`}
        >
          <MiniPins standing={top.pins} size="md" />
          {boards}
          <StrikeMove offset={top.strike_offset} />
        </button>
      </li>
    );
  }

  // The strike-ball move is per leave, so it shows only when they all agree.
  const sameMove = stack.every(
    (sl) =>
      sl.strike_offset?.stance === top.strike_offset?.stance &&
      sl.strike_offset?.target === top.strike_offset?.target
  );
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex ${span}`}
    >
      <div
        {...attributes}
        {...listeners}
        role="group"
        aria-label={`${stack.map((sl) => formatLeave(sl.pins)).join(", ")}: same line`}
        className={`${card} touch-none`}
      >
        <div className="flex w-full flex-wrap items-start justify-around gap-y-2">
          {stack.map((sl) => (
            <button
              key={sl.id}
              type="button"
              onClick={() => onOpen(sl)}
              aria-label={`Open spare line for pins ${sl.pins.join(", ")}`}
              className="flex flex-col items-center gap-1 rounded-md active:opacity-70"
            >
              <MiniPins standing={sl.pins} size="md" />
              <span className="text-[11px] font-semibold tabular-nums text-ink-secondary">
                {formatLeave(sl.pins)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 text-[10px] font-semibold uppercase tracking-tight text-ink-tertiary">
          <span className="h-px flex-1 bg-edge" aria-hidden="true" />
          Same line
          <span className="h-px flex-1 bg-edge" aria-hidden="true" />
        </div>
        {boards}
        {sameMove && <StrikeMove offset={top.strike_offset} />}
      </div>
    </li>
  );
}

/** The strike-ball move, when one is set, in words: "2 left", not "-2". A
 *  signed number beside a card of absolute boards reads as a board, and the
 *  sign means a different side for each hand. A row for each board it
 *  moves, so a narrow tile never wraps a move in half. */
function StrikeMove({ offset }: { offset?: SpareLine["strike_offset"] }) {
  const handedness = useHandedness();
  if (!offset || (!offset.stance && !offset.target)) return null;
  return (
    <div className="w-full text-accent">
      <div className="text-[10px] font-semibold uppercase tracking-tight">Strike ball</div>
      {([["Stance", offset.stance], ["Target", offset.target]] as const).map(([k, v]) =>
        v ? (
          <div key={k} className="flex items-baseline justify-center gap-1 whitespace-nowrap">
            <span className="text-[10px] font-semibold uppercase tracking-tight text-ink-secondary">{k}</span>
            <span className="text-xs font-bold tabular-nums">{describeMove(v, handedness)}</span>
          </div>
        ) : null
      )}
    </div>
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
  // Pocket leaves are shot on the strike line and are never listed (ADR-123).
  // A row saved for one stays stored, out of sight, and out of the reorder.
  const shown = useMemo(() => spareLinesShown(live ?? NO_LINES), [live]);
  const spareLines = reordered ?? shown;
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
                    <ul className="grid grid-flow-row-dense grid-cols-3 gap-2">
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
