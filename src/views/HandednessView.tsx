import { useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
  driftModel: DriftModel;
  onDriftModelChange: (next: DriftModel) => void;
}

const BOARD_MAX = 39; // upper board bound (matches deriveLaydown's clamp range)

export function HandednessView({ value, onChange, driftModel, onDriftModelChange }: HandednessViewProps) {
  // Confirm before switching — flipping handedness changes arrow direction
  // app-wide, so we don't want a stray tap to change it silently.
  const [pending, setPending] = useState<Handedness | null>(null);

  function handleSelect(next: Handedness) {
    if (next === value) return;
    setPending(next);
  }

  function setReleaseOffset(v: number) {
    onDriftModelChange({ ...driftModel, release_offset: v });
  }

  function setOutsideMax(v: number) {
    // Guard invariant: keep the middle zone at least 1 board wide.
    const clamped = Math.min(v, driftModel.inside_min - 2);
    onDriftModelChange({ ...driftModel, outside_max: clamped });
  }

  function setInsideMin(v: number) {
    const clamped = Math.max(v, driftModel.outside_max + 2);
    onDriftModelChange({ ...driftModel, inside_min: clamped });
  }

  function setDrift(zone: keyof DriftModel["drift"], v: number) {
    onDriftModelChange({ ...driftModel, drift: { ...driftModel.drift, [zone]: v } });
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

      <h2 className="mb-1 mt-8 text-base font-bold text-slate-950">Release offset</h2>
      <p className="mb-3 text-sm text-slate-500">
        Boards between your slide foot and where the ball touches down.
      </p>
      <Stepper
        ariaLabel="release offset"
        value={driftModel.release_offset}
        step={0.5}
        min={0}
        max={15}
        onChange={setReleaseOffset}
      />

      <h2 className="mb-1 mt-8 text-base font-bold text-slate-950">Drift zones</h2>
      <p className="mb-3 text-sm text-slate-500">
        Slide = stance − drift. Laydown = slide − release offset. Drift varies by where you
        stand on the approach.
      </p>
      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        <ZoneRow
          label="Outside"
          rangeLabel={`1–${driftModel.outside_max}`}
          rangeStepper={
            <Stepper
              ariaLabel="outside range end"
              value={driftModel.outside_max}
              step={0.5}
              min={1}
              max={driftModel.inside_min - 2}
              onChange={setOutsideMax}
            />
          }
          driftStepper={
            <Stepper
              ariaLabel="outside drift"
              value={driftModel.drift.outside}
              step={0.5}
              min={-10}
              max={10}
              onChange={(v) => setDrift("outside", v)}
            />
          }
        />
        <ZoneRow
          label="Middle"
          rangeLabel={`${driftModel.outside_max + 0.5}–${driftModel.inside_min - 0.5}`}
          driftStepper={
            <Stepper
              ariaLabel="middle drift"
              value={driftModel.drift.middle}
              step={0.5}
              min={-10}
              max={10}
              onChange={(v) => setDrift("middle", v)}
            />
          }
        />
        <ZoneRow
          label="Inside"
          rangeLabel={`${driftModel.inside_min}–${BOARD_MAX}`}
          rangeStepper={
            <Stepper
              ariaLabel="inside range start"
              value={driftModel.inside_min}
              step={0.5}
              min={driftModel.outside_max + 2}
              max={BOARD_MAX}
              onChange={setInsideMin}
            />
          }
          driftStepper={
            <Stepper
              ariaLabel="inside drift"
              value={driftModel.drift.inside}
              step={0.5}
              min={-10}
              max={10}
              onChange={(v) => setDrift("inside", v)}
            />
          }
        />
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

function ZoneRow({
  label,
  rangeLabel,
  rangeStepper,
  driftStepper
}: {
  label: string;
  rangeLabel: string;
  rangeStepper?: React.ReactNode;
  driftStepper: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="w-16 shrink-0 text-sm font-semibold text-slate-900">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-xs tabular-nums text-slate-500">{rangeLabel}</span>
        {rangeStepper}
      </div>
      <div className="shrink-0">{driftStepper}</div>
    </div>
  );
}

function Stepper({
  ariaLabel,
  value,
  step,
  min,
  max,
  onChange
}: {
  ariaLabel: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(Math.max(min, value - step))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
      >
        −
      </button>
      <span className="w-12 text-center text-base font-bold tabular-nums text-slate-900">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(Math.min(max, value + step))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
      >
        +
      </button>
    </div>
  );
}
