import { useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Handedness } from "../types/bowling";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
}

export function HandednessView({ value, onChange }: HandednessViewProps) {
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
