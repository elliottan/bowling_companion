import type { Handedness } from "../types/bowling";
import { Button } from "./ui/Button";

interface HandednessPickerProps {
  value: Handedness | null;
  onSelect: (value: Handedness) => void;
}

const LABEL: Record<Handedness, string> = {
  left: "Left-handed",
  right: "Right-handed"
};

/** Two-button Right / Left chooser, shared by the first-run modal and settings. */
export function HandednessPicker({ value, onSelect }: HandednessPickerProps) {
  return (
    <div className="flex gap-2">
      {/* Laid out the way the bowler faces the lane: Left on the left, Right on
          the right, so the button's position matches the hand it names. */}
      {(["left", "right"] as const).map((h) => (
        <Button
          key={h}
          size="lg"
          variant={value === h ? "primary" : "secondary"}
          aria-pressed={value === h}
          onClick={() => onSelect(h)}
          className="flex-1"
        >
          {LABEL[h]}
        </Button>
      ))}
    </div>
  );
}
