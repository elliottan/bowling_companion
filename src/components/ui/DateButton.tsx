import { useRef } from "react";
import { formatSessionDate } from "../../lib/dates";

/**
 * A day picked as iOS's compact date picker picks one (ADR-237): the date,
 * written the way the device writes it, in a small grey capsule, and a tap
 * opens the system's own calendar.
 *
 * The picker is the platform's: a real `<input type="date">` lies over the
 * capsule, invisible, so the tap lands on it and Safari and the store apps
 * raise the phone's date picker. The browser's own box showed the date as a
 * form field does, "11/04/2026" in a box the width of the form, where iOS
 * shows "4 Nov 2026" on a chip. Where a tap on the box does not open the
 * picker on its own (desktop Chrome opens it only from its icon),
 * `showPicker` does.
 */
export function DateButton({
  value,
  onChange,
  label,
  required = false
}: {
  /** The stored day, `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
  /** The accessible name, where no `<label>` wraps the button. */
  label?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex h-11 items-center">
      <span
        aria-hidden="true"
        className="segmented-track inline-flex h-[34px] items-center rounded-lg px-3 text-body tabular-nums text-ink"
      >
        {value ? formatSessionDate(value) : "-"}
      </span>
      <input
        ref={inputRef}
        type="date"
        required={required}
        aria-label={label}
        value={value}
        onChange={(e) => {
          // Clearing is not a choice here: a session always has a day, and
          // iOS's picker offers a Reset that would empty it.
          if (e.target.value) onChange(e.target.value);
        }}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Already open, or not allowed from this event: the tap still
            // reached the input, which is the fallback.
          }
        }}
        className="date-button-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
