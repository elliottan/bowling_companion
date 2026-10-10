import { ListFilter } from "lucide-react";
import { createPortal } from "react-dom";
import { PinGrid } from "./PinGrid";
import { FormSheet } from "./ui/FormSheet";
import { Chip, TAP_TARGET_44 } from "./ui/Chip";
import { ALL_PINS } from "../lib/pins";
import { SPARE_FILTERS } from "../lib/spareLines";
import type { SpareFilters } from "../lib/useSpareFilters";

/**
 * The chips that cut a list of leaves down: All, Pins (a deck), the shapes and
 * whether a line is saved. The Spare lines screen and the Stats tab's All
 * leaves sheet both wear it, over the one shared `useSpareFilters` (ADR-128).
 *
 * "All" is on while nothing else is, and clears the rest. The deck opens in a
 * sheet of its own; the caller is told when it is open, so a sheet underneath
 * can stand down its Escape and focus trap while it is.
 */
export function SpareFilterBar({
  state,
  label,
  pinsOpen,
  onPinsOpenChange
}: {
  state: SpareFilters;
  /** Spoken name for the row. */
  label: string;
  pinsOpen: boolean;
  onPinsOpenChange: (open: boolean) => void;
}) {
  const pinsActive = state.pins.size > 0;
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        <Chip selected={!state.active} onClick={state.clear}>
          All
        </Chip>
        <Chip selected={pinsActive} onClick={() => onPinsOpenChange(true)}>
          <ListFilter size={13} aria-hidden="true" className="mr-1" />
          {pinsActive ? `Pins ${[...state.pins].sort((a, b) => a - b).join("-")}` : "Pins"}
        </Chip>
        {SPARE_FILTERS.map((f) => (
          <Chip key={f.id} selected={state.filters.has(f.id)} onClick={() => state.toggle(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {/* Portalled: a sheet that slides on a transform makes `fixed` resolve
          against itself, and this one can open over another sheet. */}
      {pinsOpen &&
        createPortal(
          <FormSheet title="Pins" onClose={() => onPinsOpenChange(false)} dismissAs="done">
            <div className="space-y-4">
              <div className="mx-auto w-[11.5rem]">
                <PinGrid
                  standingPins={[...state.pins]}
                  availablePins={ALL_PINS}
                  onChange={state.setPins}
                  size="sm"
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3">
                <input
                  type="checkbox"
                  checked={state.exact}
                  onChange={(e) => state.setExact(e.target.checked)}
                  className="h-5 w-5 rounded border-edge-strong accent-[rgb(var(--color-accent-fill))]"
                />
                <span className="text-sm font-medium text-ink-strong">Only these pins</span>
              </label>
              {pinsActive && (
                <button
                  type="button"
                  onClick={() => state.setPins([])}
                  className={`relative text-sm font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
                >
                  Clear pins
                </button>
              )}
            </div>
          </FormSheet>,
          document.body
        )}
    </>
  );
}
