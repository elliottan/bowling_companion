import type { Handedness } from "../types/bowling";

interface HandednessPickerProps {
  value: Handedness | null;
  onSelect: (value: Handedness) => void;
}

/** Two-button Right / Left chooser, shared by the first-run modal and settings. */
export function HandednessPicker({ value, onSelect }: HandednessPickerProps) {
  return (
    <div className="flex gap-2">
      {/* Laid out the way the bowler faces the lane: Left on the left, Right on
          the right — so the button's position matches the hand it names. */}
      {(["left", "right"] as const).map((h) => (
        <button
          key={h}
          type="button"
          aria-pressed={value === h}
          onClick={() => onSelect(h)}
          className={`h-12 flex-1 rounded-lg border text-sm font-semibold capitalize ${
            value === h
              ? "border-felt-700 bg-felt-700 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {h}-handed
        </button>
      ))}
    </div>
  );
}
