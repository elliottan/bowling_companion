import { TAP_TARGET_44 } from "./Chip";

interface SegmentedControlProps<T extends string> {
  /** Spoken name for the group, since the segments only say their own label. */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  /** Null where the question has not been answered yet, which is a real state
   *  on the first run: no segment is pressed, and the track still says that
   *  exactly one of these is the answer. */
  value: T | null;
  onChange: (value: T) => void;
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
  onChange
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 rounded-xl border border-edge bg-surface-muted p-1"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`relative h-10 flex-1 rounded-lg text-sm font-semibold ${TAP_TARGET_44} ${
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
