import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { PushScreen } from "../components/PushScreen";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DriftZoneLane, ZONE_ACCENT } from "../components/DriftZoneLane";
import type { Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";
import { GROUP_HEADING } from "../components/ui/typography";

interface HandednessViewProps {
  value: Handedness;
  onChange: (value: Handedness) => void;
  driftModel: DriftModel;
  /** Present when pushed from Settings, draws the shared nav bar. */
  onBack?: () => void;
  onDriftModelChange: (next: DriftModel) => void;
}

const BOARD_MAX = 39; // upper board bound (matches deriveLaydown's clamp range)

const ZONES = ["outside", "middle", "inside"] as const;

export function HandednessView({ value, onChange, driftModel, onDriftModelChange, onBack }: HandednessViewProps) {
  // Confirm before switching, flipping handedness mirrors the whole app, so we
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

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-7 px-3 py-4 sm:px-6">
      <Group
        heading="Handedness"
        description={
          <>
            Board numbers count in from your side of the lane, so everything the app draws
            and every number you type is relative to the hand you bowl with.
          </>
        }
      >
        {/* Picker shows the committed value; the pending choice only applies on confirm. */}
        <HandednessPicker value={value} onSelect={handleSelect} />
      </Group>

      <Group
        heading="Release offset"
        description={
          <>
            Boards from your slide foot to the ball's laydown point. It counts to the{" "}
            <span className="font-semibold text-ink-strong">{ballSide}</span> of your foot, the
            side you release on.
          </>
        }
      >
        <div className="rounded-xl border border-edge bg-surface px-3">
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
      </Group>

      <Group
        heading="Drift zones"
        description="Set how much you drift, depending on where you start on the approach."
      >
        <DriftZoneLane model={driftModel} hand={value} />

        <div className="mt-3 space-y-2">
          {ZONES.map((zone) => (
            <div key={zone} className="rounded-xl border border-edge bg-surface p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${ZONE_ACCENT[zone].swatch}`} aria-hidden="true" />
                <span className="text-sm font-semibold capitalize text-ink">{zone}</span>
                <span className="ml-auto text-xs tabular-nums text-ink-secondary">{zoneRange[zone]}</span>
              </div>
              <div className="divide-y divide-edge">
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
      </Group>

      <ConfirmDialog
        open={pending !== null}
        title="Change handedness?"
        message={
          pending ? (
            <>
              <p>
                Everything mirrors: board 1, the arrows, spare targets, offset and drift all
                flip to the other side.
              </p>
              <p>
                Saved sessions stay as recorded. Old lines will draw on the wrong side now.
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

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Preferences" onBack={onBack}>
      {body}
    </PushScreen>
  );
}

/**
 * A titled block of the page. The heading is the app's one group heading band
 * rather than a third heading size invented here: three sections each opening
 * with their own bold line read as three pages stacked, not as one screen.
 */
function Group({
  heading,
  description,
  children
}: {
  heading: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className={GROUP_HEADING}>{heading}</h2>
      <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">{description}</p>
      {children}
    </section>
  );
}

/** Label on the left, control flush right: one grid for every input on the page. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[3rem] items-center gap-3">
      <span className="text-sm text-ink-strong">
        {label}
        {hint && <span className="ml-1 text-xs text-ink-secondary">({hint})</span>}
      </span>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  );
}

/** Drift is stored signed, but a sign is meaningless to a bowler standing on the
 *  approach. Show the physical direction instead, and make the left arrow move
 *  the foot left, which means the arrows mirror for a left-hander, since
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
    <div className="inline-flex items-center rounded-lg border border-edge bg-surface">
      <button
        type="button"
        aria-label={`Move ${ariaLabel} left`}
        onClick={() => nudge(leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-ink">
        {dir === "none" ? "None" : `${Math.abs(value)} ${dir}`}
      </span>
      <button
        type="button"
        aria-label={`Move ${ariaLabel} right`}
        onClick={() => nudge(-leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronRight size={16} aria-hidden="true" />
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
    <div className="inline-flex items-center rounded-lg border border-edge bg-surface">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(Math.max(min, value - step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(Math.min(max, value + step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
