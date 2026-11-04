import { t } from "@lingui/core/macro";
import { Minus, Plus } from "lucide-react";
import { haptic } from "../../lib/haptics";
import { stepValue } from "../../lib/stepValue";
import { TAP_TARGET_44 } from "./Chip";

/**
 * A minus and a plus in one capsule, as UIKit's `UIStepper` (ADR-237): the
 * segmented control's grey fill, a hairline between the halves, and each half
 * dimmed at its end of the range. It sits beside a field that can still be
 * typed into, because a stepper is for the nudge, a half board or a foot, and
 * the keyboard is for the jump.
 *
 * An empty field's first press sets `start` rather than stepping from nothing,
 * as there is no value to step from.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  start,
  label
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Where the first press lands when there is no value yet. */
  start: number;
  /** The value's name, for the halves' accessible names. */
  label: string;
}) {
  const press = (dir: 1 | -1) => {
    const next = value == null ? start : stepValue(value, step, dir, min, max);
    if (next === value) return;
    void haptic("select");
    onChange(next);
  };
  const half = `relative flex h-full flex-1 items-center justify-center text-ink active:bg-ink/10 disabled:text-ink-tertiary disabled:active:bg-transparent ${TAP_TARGET_44}`;

  return (
    <span className="segmented-track inline-flex h-8 w-[94px] shrink-0 items-center overflow-hidden rounded-lg">
      <button
        type="button"
        aria-label={t`Decrease ${{ label }}`}
        disabled={value != null && value <= min}
        onClick={() => press(-1)}
        className={half}
      >
        <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="h-[18px] w-px bg-ink/20" />
      <button
        type="button"
        aria-label={t`Increase ${{ label }}`}
        disabled={value != null && value >= max}
        onClick={() => press(1)}
        className={half}
      >
        <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </span>
  );
}
