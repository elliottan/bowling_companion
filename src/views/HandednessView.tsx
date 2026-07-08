import { useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Handedness } from "../types/bowling";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
  laydownOffset: number;
  onLaydownOffsetChange: (value: number) => void;
}

export function HandednessView({ value, onChange, laydownOffset, onLaydownOffsetChange }: HandednessViewProps) {
  // Confirm before switching — flipping handedness changes arrow direction
  // app-wide, so we don't want a stray tap to change it silently.
  const [pending, setPending] = useState<Handedness | null>(null);

  function handleSelect(next: Handedness) {
    if (next === value) return;
    setPending(next);
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-1 text-xl font-bold text-slate-950">Handedness</h1>
      <p className="mb-4 text-sm text-slate-500">
        Sets which way the board-adjust arrows move. For a right-hander, the left arrow
        increases the board number; left-handers are mirrored.
      </p>
      {/* Picker shows the committed value; the pending choice only applies on confirm. */}
      <HandednessPicker value={value} onSelect={handleSelect} />

      <h2 className="mb-1 mt-8 text-base font-bold text-slate-950">Laydown offset</h2>
      <p className="mb-3 text-sm text-slate-500">
        Boards between where you stand and where the ball touches down. The lane view
        derives your laydown as stance − offset; drag the laydown point to override it
        for a single line.
      </p>
      <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        <button
          type="button"
          aria-label="Decrease laydown offset"
          onClick={() => onLaydownOffsetChange(Math.max(0, laydownOffset - 0.5))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
        >
          −
        </button>
        <span className="w-12 text-center text-base font-bold tabular-nums text-slate-900">{laydownOffset}</span>
        <button
          type="button"
          aria-label="Increase laydown offset"
          onClick={() => onLaydownOffsetChange(Math.min(15, laydownOffset + 0.5))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
        >
          +
        </button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Change handedness?"
        message={
          pending
            ? `Switch to ${pending}-handed? This flips the board-adjust arrow direction across the app.`
            : undefined
        }
        confirmLabel="Change"
        onConfirm={() => {
          if (pending) onChange(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
