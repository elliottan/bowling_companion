import type { Handedness } from "../types/bowling";
import { SegmentedControl } from "./ui/SegmentedControl";

interface HandednessPickerProps {
  value: Handedness | null;
  onSelect: (value: Handedness) => void;
}

/**
 * Right / Left, shared by the first run and Settings.
 *
 * A segmented control rather than two buttons: this is one answer out of two,
 * and the shared track says so before either label is read. Two primary-sized
 * buttons side by side read as two separate actions (DESIGN-LANGUAGE §4).
 *
 * Laid out the way the bowler faces the lane, left on the left, so a button's
 * position matches the hand it names.
 */
export function HandednessPicker({ value, onSelect }: HandednessPickerProps) {
  return (
    <SegmentedControl
      label="Handedness"
      value={value}
      onChange={onSelect}
      options={[
        { value: "left", label: "Left-handed" },
        { value: "right", label: "Right-handed" }
      ]}
    />
  );
}
