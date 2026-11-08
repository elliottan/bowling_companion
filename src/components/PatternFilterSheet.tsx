import { t } from "@lingui/core/macro";
import { ClearAllButton } from "./ui/ClearAllButton";
import { SlidersHorizontal } from "lucide-react";
import { Chip } from "./ui/Chip";
import { FormSheet } from "./ui/FormSheet";
import { IconButton } from "./ui/IconButton";
import { RangeSlider } from "./ui/RangeSlider";
import { GROUP_HEADING } from "./ui/typography";
import { PATTERN_CLASS_LABEL, type PatternClass } from "../lib/oilPattern";
import { NO_PATTERN_FILTERS, patternFilterCount, type PatternFilters } from "../lib/patternFilters";

const SHAPES = ["sport", "challenge", "recreation"] as const;

/** The round control that opens the sheet: lit while anything is applied, with
 *  the count on it. */
export function PatternFilterButton({ filters, onOpen }: { filters: PatternFilters; onOpen: () => void }) {
  const count = patternFilterCount(filters);
  return (
    <span className="relative inline-flex shrink-0">
      <IconButton
        label={count === 0 ? t`Filters` : t`Filters, ${{ count }} applied`}
        // The filled twin lights it while a filter is on.
        variant={count > 0 ? "confirm" : "round"}
        onClick={onOpen}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
      </IconButton>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fill px-1 text-caption-2 font-bold tabular-nums text-accent-on-fill"
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
    <FormSheet
      title={t`Filters`}
      onClose={onClose}
      dismissAs="done"
      leading={<ClearAllButton onClick={() => onChange(NO_PATTERN_FILTERS)} disabled={patternFilterCount(filters) === 0} />}
    >
      <div className="space-y-5">
        <div>
          <p className={`mb-2 ${GROUP_HEADING}`}>{t`Play style`}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t`Play style`}>
            {SHAPES.map((shape) => (
              <Chip key={shape} selected={filters.shapes.has(shape)} onClick={() => toggle(shape)}>
                {PATTERN_CLASS_LABEL[shape]}
              </Chip>
            ))}
          </div>
        </div>

        <RangeSlider
          label={t`Length`}
          min={bounds.min}
          max={bounds.max}
          step={1}
          valueMin={lo}
          valueMax={hi}
          format={(v) => t`${{ feet: v }} ft`}
          onChange={(min, max) =>
            onChange({
              ...filters,
              minFeet: min > bounds.min ? min : null,
              maxFeet: max < bounds.max ? max : null,
            })
          }
        />
      </div>
    </FormSheet>
  );
}
