import { useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DriftZoneLane, ZONE_ACCENT } from "../components/DriftZoneLane";
import type { Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
  driftModel: DriftModel;
  onDriftModelChange: (next: DriftModel) => void;
}

const BOARD_MAX = 39; // upper board bound (matches deriveLaydown's clamp range)

const ZONES = ["outside", "middle", "inside"] as const;

export function HandednessView({ value, onChange, driftModel, onDriftModelChange }: HandednessViewProps) {
  // Confirm before switching — flipping handedness mirrors the whole app, so we
  // don't want a stray tap to change it silently.
  const [pending, setPending] = useState<Handedness | null>(null);

  const ballSide = value === "right" ? "right" : "left";

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

  const zoneRange: Record<(typeof ZONES)[number], string> = {
    outside: `Boards 1 to ${driftModel.outside_max}`,
    middle: `Boards ${driftModel.outside_max + 0.5} to ${driftModel.inside_min - 0.5}`,
    inside: `Boards ${driftModel.inside_min} to ${BOARD_MAX}`
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="text-xl font-bold text-slate-950">Handedness</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Board numbers count in from your side of the lane, so everything the app draws
        and every number you type is relative to the hand you bowl with.
      </p>
      <div className="mt-4">
        {/* Picker shows the committed value; the pending choice only applies on confirm. */}
        <HandednessPicker value={value} onSelect={handleSelect} />
      </div>

      <h2 className="mt-9 text-base font-bold text-slate-950">Release offset</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Boards between your slide foot and where the ball touches down. It counts to the{" "}
        <span className="font-semibold text-slate-700">{ballSide}</span> of your foot, the side
        you release on.
      </p>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <Row label="Offset" hint="boards">
          <Stepper
            ariaLabel="release offset"
            value={driftModel.release_offset}
            step={0.5}
            min={0}
            max={15}
            onChange={setReleaseOffset}
          />
        </Row>
      </div>

      <h2 className="mt-9 text-base font-bold text-slate-950">Drift zones</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Your slide foot rarely lands on the board you started on. Set how far it drifts,
        and which way, for each part of the approach.
      </p>

      <div className="mt-3">
        <DriftZoneLane model={driftModel} hand={value} />
      </div>

      <div className="mt-3 space-y-3">
        {ZONES.map((zone) => (
          <div key={zone} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${ZONE_ACCENT[zone].swatch}`} aria-hidden="true" />
              <span className="text-sm font-bold capitalize text-slate-900">{zone}</span>
              <span className="ml-auto text-xs tabular-nums text-slate-500">{zoneRange[zone]}</span>
            </div>
            <div className="space-y-2">
              {zone === "outside" && (
                <Row label="Ends at board">
                  <Stepper
                    ariaLabel="outside range end"
                    value={driftModel.outside_max}
                    step={0.5}
                    min={1}
                    max={driftModel.inside_min - 2}
                    onChange={setOutsideMax}
                  />
                </Row>
              )}
              {zone === "inside" && (
                <Row label="Starts at board">
                  <Stepper
                    ariaLabel="inside range start"
                    value={driftModel.inside_min}
                    step={0.5}
                    min={driftModel.outside_max + 2}
                    max={BOARD_MAX}
                    onChange={setInsideMin}
                  />
                </Row>
              )}
              <Row label="Drift">
                <DriftStepper
                  ariaLabel={`${zone} drift`}
                  value={driftModel.drift[zone]}
                  hand={value}
                  onChange={(v) => setDrift(zone, v)}
                />
              </Row>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Change handedness?"
        message={
          pending ? (
            <>
              <p>
                Switching to {pending}-handed mirrors the app. Board 1 moves to the other
                edge of the lane, the board-adjust arrows swap sides, spare targets flip to
                the other pocket, and your release offset and drift keep their numbers but
                now point the other way.
              </p>
              <p>
                Saved sessions are not converted. Every line you have already recorded was
                stored against your old hand, so those lines will now be drawn on the
                opposite side of the lane.
              </p>
            </>
          ) : undefined
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

/** Label on the left, control flush right — one grid for every input on the page. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[3rem] items-center gap-3">
      <span className="text-sm text-slate-700">
        {label}
        {hint && <span className="ml-1 text-xs text-ink-secondary">({hint})</span>}
      </span>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  );
}

/** Drift is stored signed, but a sign is meaningless to a bowler standing on the
 *  approach. Show the physical direction instead, and make the left arrow move
 *  the foot left — which means the arrows mirror for a left-hander, since
 *  positive drift walks a left-hander left (see `driftDirection`). */
function DriftStepper({
  ariaLabel,
  value,
  hand,
  onChange
}: {
  ariaLabel: string;
  value: number;
  hand: Handedness;
  onChange: (v: number) => void;
}) {
  const dir = driftDirection(value, hand);
  const leftStep = hand === "right" ? -0.5 : 0.5;
  const nudge = (d: number) => onChange(Math.max(-10, Math.min(10, value + d)));
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-label={`Move ${ariaLabel} left`}
        onClick={() => nudge(leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-slate-600 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="text-sm">◀</span>
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-slate-900">
        {dir === "none" ? "None" : `${Math.abs(value)} ${dir}`}
      </span>
      <button
        type="button"
        aria-label={`Move ${ariaLabel} right`}
        onClick={() => nudge(-leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-slate-600 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="text-sm">▶</span>
      </button>
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
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(Math.max(min, value - step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-slate-600 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="text-sm">◀</span>
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-slate-900">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(Math.min(max, value + step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-slate-600 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="text-sm">▶</span>
      </button>
    </div>
  );
}
