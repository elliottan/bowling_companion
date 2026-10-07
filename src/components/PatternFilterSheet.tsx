import { SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { FormSheet } from "./ui/FormSheet";
import { IconButton } from "./ui/IconButton";
import { RangeSlider } from "./ui/RangeSlider";
import { GROUP_HEADING } from "./ui/typography";
import { PATTERN_CLASS_LABEL, type PatternClass } from "../lib/oilPattern";

/** The pattern list's filters: any mix of play styles, and a length range in
 *  feet. `null` bounds mean the range is untouched. */
export interface PatternFilters {
  shapes: ReadonlySet<PatternClass>;
  minFeet: number | null;
  maxFeet: number | null;
}

export const NO_PATTERN_FILTERS: PatternFilters = { shapes: new Set(), minFeet: null, maxFeet: null };

const SHAPES = ["sport", "challenge", "recreation"] as const;

/** How many kinds of filter are on, for the button's badge. The play styles
 *  count once however many are picked, the same rule the session filter keeps. */
export function patternFilterCount(f: PatternFilters): number {
  return (f.shapes.size > 0 ? 1 : 0) + (f.minFeet != null || f.maxFeet != null ? 1 : 0);
}

export function matchesPatternFilters(
  feet: number | null,
  plays: PatternClass | null,
  f: PatternFilters,
): boolean {
  if (f.shapes.size > 0 && (plays == null || !f.shapes.has(plays))) return false;
  if (f.minFeet != null || f.maxFeet != null) {
    if (feet == null) return false;
    const whole = Math.round(feet);
    if (f.minFeet != null && whole < f.minFeet) return false;
    if (f.maxFeet != null && whole > f.maxFeet) return false;
  }
  return true;
}

/** The round control that opens the sheet: lit while anything is applied, with
 *  the count on it. */
export function PatternFilterButton({ filters, onOpen }: { filters: PatternFilters; onOpen: () => void }) {
  const count = patternFilterCount(filters);
  return (
    <span className="relative inline-flex shrink-0">
      <IconButton
        label={count === 0 ? "Filters" : `Filters, ${count} applied`}
        // The filled twin lights it while a filter is on.
        variant={count > 0 ? "confirm" : "round"}
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

/** Applies as you go, so the tick only closes it. `bounds` are the shortest and
 *  longest pattern on offer, in whole feet. */
export function PatternFilterSheet({
  filters, onChange, bounds, onClose,
}: {
  filters: PatternFilters;
  onChange: (next: PatternFilters) => void;
  bounds: { min: number; max: number };
  onClose: () => void;
}) {
  const lo = filters.minFeet ?? bounds.min;
  const hi = filters.maxFeet ?? bounds.max;
  function toggle(shape: PatternClass) {
    const next = new Set(filters.shapes);
    if (!next.delete(shape)) next.add(shape);
    onChange({ ...filters, shapes: next });
  }
  return (
    <FormSheet title="Filters" onClose={onClose} dismissAs="done">
      <div className="space-y-5">
        <div>
          <p className={`mb-2 ${GROUP_HEADING}`}>Play style</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Play style">
            {SHAPES.map((shape) => (
              <Chip key={shape} selected={filters.shapes.has(shape)} onClick={() => toggle(shape)}>
                {PATTERN_CLASS_LABEL[shape]}
              </Chip>
            ))}
          </div>
        </div>

        <RangeSlider
          label="Length"
          min={bounds.min}
          max={bounds.max}
          step={1}
          valueMin={lo}
          valueMax={hi}
          format={(v) => `${v} ft`}
          onChange={(min, max) =>
            onChange({
              ...filters,
              minFeet: min > bounds.min ? min : null,
              maxFeet: max < bounds.max ? max : null,
            })
          }
        />

        {patternFilterCount(filters) > 0 && (
          <Button variant="ghost" onClick={() => onChange(NO_PATTERN_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
    </FormSheet>
  );
}
