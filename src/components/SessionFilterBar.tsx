import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "./ui/Button";
import { Chip, TAP_TARGET_44 } from "./ui/Chip";
import { FormSheet } from "./ui/FormSheet";
import { IconButton } from "./ui/IconButton";
import { FIELD_SELECT, FIELD_LABEL } from "./ui/field";
import { GROUP_HEADING } from "./ui/typography";
import type { SessionFilters } from "../views/useSessionFilters";

/**
 * The filter History and Stats share, in three pieces (ADR-060).
 *
 * It used to be four rows of controls above the content: two selects, the game
 * chips and a chip per lane. At a house with twelve lanes that wrapped to
 * three rows and pushed the first number most of the way down the screen,
 * which is a poor trade for controls that are mostly not being used.
 *
 * So the options live in a sheet, and only what is *applied* stays on screen.
 * Hiding the applied filter too would have been smaller still and wrong: a
 * filtered average is a different number from an unfiltered one, and a screen
 * of statistics has to say which one you are looking at
 * (docs/DESIGN-LANGUAGE.md §4b). With nothing applied there is nothing to say,
 * and the row disappears entirely.
 */

/** How many kinds of filter are on, for the button's badge. Lanes count once
 *  however many are picked: three lanes is one answer to one question, and a
 *  badge reading 5 would suggest five things to go and undo. */
function activeFilterCount(filters: SessionFilters): number {
  return (
    (filters.alley ? 1 : 0) +
    (filters.pattern ? 1 : 0) +
    (filters.gameNumber != null ? 1 : 0) +
    (filters.activeLanes.length > 0 ? 1 : 0)
  );
}

/** The round control that opens the sheet, with a count when anything is on. */
export function SessionFilterButton({
  filters,
  onOpen
}: {
  filters: SessionFilters;
  onOpen: () => void;
}) {
  const count = activeFilterCount(filters);
  return (
    <span className="relative inline-flex shrink-0">
      <IconButton
        label={count === 0 ? "Filters" : `Filters, ${count} applied`}
        variant="round"
        onClick={onOpen}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
      </IconButton>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fill px-1 text-[11px] font-bold tabular-nums text-accent-on-fill"
        >
          {count}
        </span>
      )}
    </span>
  );
}

/**
 * What is currently applied, one removable chip each. Renders nothing when
 * nothing is on, which is the common case and the whole height saving.
 */
export function SessionFilterChips({ filters }: { filters: SessionFilters }) {
  const { alley, setAlley, pattern, setPattern, gameNumber, setGameNumber } = filters;
  const { activeLanes, clearLanes } = filters;
  const count = activeFilterCount(filters);
  if (count === 0) return null;

  return (
    // One row that scrolls sideways rather than wrapping: wrapping is what the
    // old bar did, and it is how three lanes turned into another 44px.
    //
    // py-1.5, and on both sides: overflow-x-auto forces overflow-y to auto,
    // which clips at the padding box, and these chips overhang their own box
    // by 6px top and bottom to reach 44pt. Without it the top of every tap
    // region is dead (the same bug ActiveSessionView's game row carries a note
    // about).
    <div className="-mx-3 mb-2 flex items-center gap-2 overflow-x-auto px-3 py-1.5 sm:-mx-6 sm:px-6">
      {alley && <AppliedChip label={alley} onRemove={() => setAlley("")} />}
      {pattern && <AppliedChip label={pattern} onRemove={() => setPattern("")} />}
      {gameNumber != null && (
        <AppliedChip label={`Game ${gameNumber}`} onRemove={() => setGameNumber(null)} />
      )}
      {activeLanes.length > 0 && (
        <AppliedChip
          label={`${activeLanes.length === 1 ? "Lane" : "Lanes"} ${activeLanes.join(", ")}`}
          onRemove={clearLanes}
        />
      )}
      {count > 1 && (
        <Button
          variant="ghost"
          className="shrink-0 px-2 text-xs font-medium text-ink-secondary"
          onClick={() => {
            setAlley("");
            setPattern("");
            setGameNumber(null);
            clearLanes();
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

/** One applied filter. The whole chip removes it, so the X is a mark rather
 *  than a second control inside a control. */
function AppliedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className={`relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-accent-fill bg-accent-soft px-3 text-xs font-semibold text-accent ${TAP_TARGET_44}`}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      <X size={13} aria-hidden="true" className="shrink-0" />
    </button>
  );
}

/** Every option, in a sheet. It applies as you go, so it has no commit and the
 *  close is the only way out (`FormSheet` with no `onConfirm`). */
export function SessionFilterSheet({
  filters,
  onClose
}: {
  filters: SessionFilters;
  onClose: () => void;
}) {
  const {
    alley,
    setAlley,
    pattern,
    setPattern,
    gameNumber,
    setGameNumber,
    lanes,
    toggleLane,
    clearLanes,
    allAlleys,
    allPatterns,
    allGameNumbers,
    allLanes
  } = filters;

  return (
    <FormSheet title="Filters" onClose={onClose}>
      <div className="space-y-4 px-4 py-4">
        <div>
          <label className={FIELD_LABEL} htmlFor="filter-alley">
            Location
          </label>
          <select
            id="filter-alley"
            value={alley}
            onChange={(e) => setAlley(e.target.value)}
            className={FIELD_SELECT}
          >
            <option value="">All locations</option>
            {allAlleys.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor="filter-pattern">
            Oil pattern
          </label>
          <select
            id="filter-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={FIELD_SELECT}
          >
            <option value="">All patterns</option>
            {allPatterns.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {allGameNumbers.length > 1 && (
          <div>
            <span className={GROUP_HEADING}>Game</span>
            {/* gap-2 is load-bearing: Chip expands its tap target 4px past its
                own box top and bottom, so anything tighter would overlap hit
                regions on a wrapped row. */}
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip selected={gameNumber === null} onClick={() => setGameNumber(null)}>
                All
              </Chip>
              {allGameNumbers.map((n) => (
                <Chip
                  key={n}
                  selected={gameNumber === n}
                  onClick={() => setGameNumber(gameNumber === n ? null : n)}
                >
                  {n}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {allLanes.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <span className={GROUP_HEADING}>Lanes</span>
              {lanes.length > 0 && (
                <Button
                  variant="ghost"
                  className="px-2 text-xs font-medium text-ink-secondary"
                  onClick={clearLanes}
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {allLanes.map((l) => (
                <Chip key={l} selected={lanes.includes(l)} onClick={() => toggleLane(l)}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {allLanes.length === 0 && (
          <p className="text-xs text-ink-secondary">
            Pick a location to filter by lane.
          </p>
        )}
      </div>
    </FormSheet>
  );
}
