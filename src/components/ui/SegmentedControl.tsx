import { useRef, useState } from "react";
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
 *
 * And it behaves as the system's control does (ADR-200): the pill follows a
 * finger across the track, ticking at each segment, and the answer lands when
 * the finger lifts; the pill swells while held and settles on a spring. Before,
 * it only jumped to a tapped segment on a flat ease, which is what made it read
 * as a web control beside the phone's own tab bar.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  dense = false
}: SegmentedControlProps<T>) {
  const index = options.findIndex((o) => o.value === value);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // While a finger is down: the segment under it, which the pill follows. The
  // answer changes only when the finger lifts, as UIKit's control does, so a
  // slide across the track is one choice, not three.
  const [held, setHeld] = useState<number | null>(null);
  // Whether this press has ticked yet, so a slide that ticked on its way does
  // not tick again as it lands, and a plain tap still ticks once.
  const ticked = useRef(false);

  const segmentAt = (clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || !Number.isFinite(clientX)) return Math.max(index, 0);
    const i = Math.floor(((clientX - box.left) / box.width) * options.length);
    return Math.min(options.length - 1, Math.max(0, i));
  };

  const shown = held ?? index;

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={label}
      // Sideways is the control's; down still scrolls the page, and a scroll
      // taking the finger cancels the press without choosing anything.
      className={`segmented-track relative grid touch-pan-y select-none rounded-full ${dense ? "p-0.5" : "p-1"}`}
      // Plain `1fr`, whose floor is each label's own width: at a large text
      // size every segment widens to the longest label and stays equal, so the
      // pill still spans one, where `minmax(0, 1fr)` let labels overlap.
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        ticked.current = false;
        setHeld(segmentAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (held === null) return;
        const next = segmentAt(e.clientX);
        if (next !== held) {
          // A tick at every segment the pill crosses, as the system's gives.
          void haptic("select");
          ticked.current = true;
          setHeld(next);
        }
      }}
      onPointerUp={() => {
        if (held === null) return;
        const picked = options[held];
        setHeld(null);
        if (picked && picked.value !== value) {
          if (!ticked.current) void haptic("select");
          onChange(picked.value);
        }
      }}
      onPointerCancel={() => setHeld(null)}
    >
      {/* The pill, one segment wide, slid to the answer, or to the segment
          under a finger while one is down. None while the question has no
          answer yet and nothing is held. It travels on a spring that settles
          a little past and back, and swells while held, as the iOS 26
          control's thumb does. */}
      {shown >= 0 && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 transition-transform duration-[420ms] motion-reduce:transition-none ease-[cubic-bezier(0.34,1.36,0.64,1)] ${
            dense ? "inset-y-0.5 ml-0.5" : "inset-y-1 ml-1"
          }`}
          style={{
            width: `calc((100% - ${dense ? "0.25rem" : "0.5rem"}) / ${options.length})`,
            transform: `translateX(${shown * 100}%)`
          }}
        >
          <span
            className={`segmented-pill block h-full w-full rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none ${
              held !== null ? "scale-[1.07]" : ""
            }`}
          />
        </span>
      )}
      {options.map((opt, i) => {
        const selected = i === shown;
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.srLabel}
            aria-pressed={opt.value === value}
            // The keyboard's way in (Enter, Space), which clicks with no
            // pointer behind it. A finger's click arrives after its pointerup
            // has already chosen, so it is left alone.
            onClick={(e) => {
              if (e.detail !== 0) return;
              if (opt.value !== value) void haptic("select");
              onChange(opt.value);
            }}
            // Ink either way, as the tab bar's labels and UIKit's are: weight
            // marks the answer, and the secondary grey on the track fell short
            // of the contrast floor.
            className={`relative whitespace-nowrap rounded-full px-1.5 text-sm text-ink transition-[font-weight] ${
              dense ? "h-9" : "h-10"
            } ${TAP_TARGET_44} ${selected ? "font-semibold" : "font-medium"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
