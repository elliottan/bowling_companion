import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Range slider, single track, fill between handles, commit on release
// ---------------------------------------------------------------------------

export interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  format: (v: number) => string;
  onChange: (min: number, max: number) => void;
}

export function RangeSlider({ label, min, max, step, valueMin, valueMax, format, onChange }: RangeSliderProps) {
  // Draft state: live while dragging, committed on release
  const [draft, setDraft] = useState<{ min: number; max: number } | null>(null);
  const displayMin = draft?.min ?? valueMin;
  const displayMax = draft?.max ?? valueMax;

  // Percent helpers for the filled track
  const range = max - min;
  const leftPct = ((displayMin - min) / range) * 100;
  const rightPct = ((displayMax - min) / range) * 100;

  function commitDraft(dMin: number, dMax: number) {
    setDraft(null);
    onChange(dMin, dMax);
  }

  // A range input only fires mouseup or touchend when the pointer is released
  // over the input itself, and dragging a handle to an end value normally takes
  // the thumb off the track. Released anywhere else, the draft was never
  // committed and the filter silently did not apply. The window always sees the
  // release, so that is where the commit hangs.
  useEffect(() => {
    if (!draft) return;
    const commit = () => {
      setDraft(null);
      onChange(draft.min, draft.max);
    };
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", commit);
    return () => {
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", commit);
    };
  }, [draft, onChange]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-strong">{label}</span>
        <span className="text-xs text-ink-secondary">{format(displayMin)} to {format(displayMax)}</span>
      </div>
      <div className="relative h-5 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-edge" />
        {/* Filled segment between handles */}
        <div
          className="absolute h-1 rounded-full bg-accent-fill"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        {/* Min handle */}
        <input
          type="range"
          aria-label={`${label} minimum`}
          min={min}
          max={max}
          step={step}
          value={displayMin}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), displayMax - step);
            setDraft({ min: v, max: displayMax });
          }}
          onKeyUp={() => commitDraft(displayMin, displayMax)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-[rgb(var(--color-accent-fill))] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
        />
        {/* Max handle */}
        <input
          type="range"
          aria-label={`${label} maximum`}
          min={min}
          max={max}
          step={step}
          value={displayMax}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), displayMin + step);
            setDraft({ min: displayMin, max: v });
          }}
          onKeyUp={() => commitDraft(displayMin, displayMax)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-[rgb(var(--color-accent-fill))] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
        />
      </div>
    </div>
  );
}
