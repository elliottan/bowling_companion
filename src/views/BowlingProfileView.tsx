import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { PapEditor } from "../components/PapEditor";
import { DEFAULT_PAP } from "../lib/ballLayout";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";
import { PushScreen } from "../components/PushScreen";
import { DriftZoneLane, ZONE_ACCENT } from "../components/DriftZoneLane";
import { HandednessPicker } from "../components/HandednessPicker";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { GripStyle, Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";
import { GROUP_HEADING } from "../components/ui/typography";

interface BowlingProfileViewProps {
  /** The bowler's hand, which the release offset and drift directions read. */
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  driftModel: DriftModel;
  /** Open the guide that explains what hand and grip change. */
  onOpenGuide: () => void;
  /** Present when pushed from Settings, draws the shared nav bar. */
  onBack?: () => void;
  onDriftModelChange: (next: DriftModel) => void;
}

const BOARD_MAX = 39; // upper board bound (matches deriveLaydown's clamp range)

const ZONES = ["outside", "middle", "inside"] as const;

/**
 * Everything personal to how this bowler throws, on one page behind one
 * Settings row: hand and grip, then the numbers only the lane view and the
 * Layouts page read (PAP, release offset, drift). They were two pages, "Hand and
 * grip" and "PAP, release and drift", and a bowler looking for either had to
 * guess which. Hand and grip stay on top because they are answered first, at
 * setup, and flipping the hand mirrors every board in the app.
 */
export function BowlingProfileView({
  handedness: value,
  onHandednessChange,
  driftModel,
  onOpenGuide,
  onDriftModelChange,
  onBack
}: BowlingProfileViewProps) {
  const grip: GripStyle = useLiveQuery(getGripStyle, [], undefined) ?? "1h";

  function setReleaseOffset(v: number) {
    onDriftModelChange({ ...driftModel, release_offset: v });
  }

  function setOutsideMax(v: number) {
    // Guard invariant: keep the middle zone at least 1 board wide.
    const clamped = Math.max(1, Math.min(v, driftModel.inside_min - 2));
    if (clamped !== driftModel.outside_max) onDriftModelChange({ ...driftModel, outside_max: clamped });
  }

  function setInsideMin(v: number) {
    const clamped = Math.min(BOARD_MAX, Math.max(v, driftModel.outside_max + 2));
    if (clamped !== driftModel.inside_min) onDriftModelChange({ ...driftModel, inside_min: clamped });
  }

  function setDrift(zone: keyof DriftModel["drift"], v: number) {
    onDriftModelChange({ ...driftModel, drift: { ...driftModel.drift, [zone]: v } });
  }

  // The bowler's axis, read live: the Layouts page writes the same setting, and
  // a read taken once at mount would sit here stale behind the page that is
  // pushed over this very screen.
  const pap = useLiveQuery(getPap, [], undefined) ?? DEFAULT_PAP;
  const zoneRange: Record<(typeof ZONES)[number], string> = {
    outside: `1 to ${driftModel.outside_max}`,
    middle: `${driftModel.outside_max + 0.5} to ${driftModel.inside_min - 0.5}`,
    inside: `${driftModel.inside_min} to ${BOARD_MAX}`
  };

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-7 px-3 py-4 sm:px-6">
      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Handedness</h2>
        <HandednessPicker value={value} onSelect={onHandednessChange} />
      </div>

      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Grip</h2>
        <SegmentedControl
          label="Grip style"
          value={grip}
          onChange={(next) => void setGripStyle(next)}
          options={[
            { value: "1h", label: "One-handed" },
            { value: "2h", label: "Two-handed" }
          ]}
        />
        <button
          type="button"
          onClick={onOpenGuide}
          className={`relative mt-1 text-sm font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
        >
          Why it matters
        </button>
      </div>

      <Group heading="Your PAP">
        <div className="space-y-2 rounded-xl border border-edge bg-surface p-3">
          <PapEditor pap={pap} onChange={(next) => void setPap(next)} idPrefix="settings-pap" />
        </div>
      </Group>

      <Group heading="Release offset">
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

      <Group heading="Drift">
        <DriftZoneLane
          model={driftModel}
          hand={value}
          onOutsideMaxChange={setOutsideMax}
          onInsideMinChange={setInsideMin}
        />

        <div className="mt-3 space-y-2">
          {ZONES.map((zone) => (
            <div key={zone} className="rounded-xl border border-edge bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${ZONE_ACCENT[zone].swatch}`} aria-hidden="true" />
                <span className="text-sm font-semibold capitalize text-ink">{zone}</span>
                <div className="ml-auto shrink-0">
                  <DriftStepper
                    ariaLabel={`${zone} drift`}
                    value={driftModel.drift[zone]}
                    hand={value}
                    onChange={(v) => setDrift(zone, v)}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-ink-secondary">
                {describeDrift(driftModel.drift[zone], value, zoneRange[zone])}
              </p>
            </div>
          ))}
        </div>
      </Group>
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Bowling profile" onBack={onBack}>
      {body}
    </PushScreen>
  );
}

/**
 * A titled block of the page. The heading is the app's one group heading band
 * rather than a third heading size invented here: three sections each opening
 * with their own bold line read as three pages stacked, not as one screen.
 */
function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-3 ${GROUP_HEADING}`}>{heading}</h2>
      {children}
    </section>
  );
}

/** One zone's drift as a sentence, in the direction the foot actually moves. */
function describeDrift(drift: number, hand: Handedness, range: string): string {
  const dir = driftDirection(drift, hand);
  const stance = `when your stance is on boards ${range}`;
  if (dir === "none") return `You do not drift ${stance}.`;
  const n = Math.abs(drift);
  return `You drift ${n} ${n === 1 ? "board" : "boards"} ${dir} ${stance}.`;
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
