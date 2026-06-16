import { HandednessPicker } from "../components/HandednessPicker";
import type { Handedness } from "../types/bowling";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
}

export function HandednessView({ value, onChange }: HandednessViewProps) {
  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-1 text-xl font-bold text-slate-950">Handedness</h1>
      <p className="mb-4 text-sm text-slate-500">
        Sets which way the board-adjust arrows move. For a right-hander, the left arrow
        increases the board number; left-handers are mirrored.
      </p>
      <HandednessPicker value={value} onSelect={onChange} />
    </section>
  );
}
