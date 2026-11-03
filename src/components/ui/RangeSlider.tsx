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
      {/* Drawn as UIKit's slider (ADR-234): a thin grey track, the accent
          between the thumbs, and white round thumbs lifted by UIKit's shadow.
          44pt tall to the finger, the thumbs inset by their own radius so
          each end of the track is under the middle of a thumb. */}
      <div className="relative flex h-11 items-center">
        {/* Track background */}
        <div className="range-track absolute inset-x-3.5 h-1 rounded-full" />
        {/* Filled segment between handles */}
        <div className="absolute inset-x-3.5 h-1">
          <div
            className="absolute inset-y-0 rounded-full bg-accent-fill"
            style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
          />
        </div>
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
          className="range-input absolute inset-0 h-full w-full"
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
          className="range-input absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
