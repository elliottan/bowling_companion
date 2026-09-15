import { TAP_TARGET_44 } from "./Chip";

interface SegmentedControlProps<T extends string> {
  /** Spoken name for the group, since the segments only say their own label. */
  label: string;
  /** `srLabel` is the spoken name where the visible label is an abbreviation:
   *  a segment reading "L" says "Left" to a screen reader, so shortening the
   *  track to fit a dense row never shortens what it means. */
  options: ReadonlyArray<{ value: T; label: string; srLabel?: string }>;
  /** Null where the question has not been answered yet, which is a real state
   *  on the first run: no segment is pressed, and the track still says that
   *  exactly one of these is the answer. */
  value: T | null;
  onChange: (value: T) => void;
  /**
   * The shorter track, for a control stacked with others in a dense panel.
   *
   * Visually 36px rather than 40, with the hit region still 44pt through the
   * same invisible `::after` that `Chip` uses. That leaves 4px of overhang top
   * and bottom, so a caller stacking two of these MUST leave at least 8px
   * between them (`space-y-2`) or the two hit regions overlap and the row
   * underneath starts stealing taps meant for the one above.
   */
  dense?: boolean;
}

/**
 * One track, N segments, one of them selected. For a small closed set where the
 * options are worth seeing side by side: a theme, a handedness.
 *
 * Not a row of `Chip`s, which is what this was. Chips are a filter: any number
 * of them can be on, and they read as separate objects with gaps between them.
 * A segmented control is exactly one answer, and the shared track is what says
 * so before you read a single label.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  dense = false
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex rounded-xl border border-edge bg-surface-muted ${
        dense ? "gap-0.5 p-0.5" : "gap-1 p-1"
      }`}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.srLabel}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 rounded-lg text-sm font-semibold ${
              dense ? "h-9" : "h-10"
            } ${TAP_TARGET_44} ${
              selected
                ? "bg-accent-fill text-accent-on-fill shadow-sm"
                : "text-ink-secondary active:bg-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
