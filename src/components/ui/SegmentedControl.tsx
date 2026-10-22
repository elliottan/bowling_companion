import { haptic } from "../../lib/haptics";
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
 * options are worth seeing side by side: a theme, a handedness, a range.
 *
 * Not a row of `Chip`s, which is what this was. Chips are a filter: any number
 * of them can be on, and they read as separate objects with gaps between them.
 * A segmented control is exactly one answer, and the shared track is what says
 * so before you read a single label.
 *
 * Drawn in the tab bar's own materials, as iOS 26 apps draw their filter bars
 * (ADR-189): a frosted capsule, and the answer a lighter pill that slides to
 * the segment picked. It was an accent-filled segment for a while (ADR-182),
 * which read clearly but as a button pressed down, and no system control is
 * filled that way. In the store apps a change gives the selection tick UIKit's
 * control gives (ADR-168).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  dense = false
}: SegmentedControlProps<T>) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="group"
      aria-label={label}
      className={`segmented-track relative grid rounded-full ${dense ? "p-0.5" : "p-1"}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* The pill, one segment wide, slid to the answer. None while the
          question has no answer yet. */}
      {index >= 0 && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            dense ? "inset-y-0.5 ml-0.5" : "inset-y-1 ml-1"
          }`}
          style={{
            width: `calc((100% - ${dense ? "0.25rem" : "0.5rem"}) / ${options.length})`,
            transform: `translateX(${index * 100}%)`
          }}
        >
          <span className="segmented-pill block h-full w-full rounded-full" />
        </span>
      )}
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.srLabel}
            aria-pressed={selected}
            onClick={() => {
              if (!selected) void haptic("select");
              onChange(opt.value);
            }}
            // Ink either way, as the tab bar's labels and UIKit's are: weight
            // marks the answer, and the secondary grey on the track fell short
            // of the contrast floor.
            className={`relative min-w-0 whitespace-nowrap rounded-full px-1 text-sm text-ink ${
              dense ? "h-9" : "h-10"
            } ${TAP_TARGET_44} ${selected ? "font-semibold" : "font-medium active:opacity-60"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
