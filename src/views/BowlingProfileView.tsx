import { Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PapEditor } from "../components/PapEditor";
import { IconButton } from "../components/ui/IconButton";
import { DEFAULT_PAP } from "../lib/ballLayout";
import type { PapMeasurement } from "../lib/ballLayout";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";
import { PushScreen } from "../components/PushScreen";
import { DriftZoneLane, ZONE_ACCENT } from "../components/DriftZoneLane";
import { HandednessPicker } from "../components/HandednessPicker";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import type { GripStyle, Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";
import { GROUP_HEADING } from "../components/ui/typography";

interface BowlingProfileViewProps {
  /** The bowler's hand, which the release offset and drift directions read. */
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  driftModel: DriftModel;
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
/** Everything on the page that can be edited, held apart from what is saved
 *  until the tick. */
interface Draft {
  hand: Handedness;
  grip: GripStyle;
  pap: PapMeasurement;
  drift: DriftModel;
}

export function BowlingProfileView({
  handedness,
  onHandednessChange,
  driftModel: savedDrift,
  onDriftModelChange,
  onBack
}: BowlingProfileViewProps) {
  const savedGrip: GripStyle = useLiveQuery(getGripStyle, [], undefined) ?? "1h";
  // The bowler's axis, read live: the Layouts page writes the same setting, and
  // a read taken once at mount would sit here stale behind the page that is
  // pushed over this very screen.
  const savedPap = useLiveQuery(getPap, [], undefined) ?? DEFAULT_PAP;

  // Read, not edited, until the pencil: the hand mirrors every board in the app,
  // and the zones and the drop-downs sit under a thumb that is only scrolling.
  // Edits are made to a draft and written when the tick is pressed. Leaving the
  // page first drops the draft.
  const [draft, setDraft] = useState<Draft | null>(null);
  const editing = draft !== null;
  const saved: Draft = { hand: handedness, grip: savedGrip, pap: savedPap, drift: savedDrift };
  const shown = draft ?? saved;
  const value = shown.hand;
  const grip = shown.grip;
  const pap = shown.pap;
  const driftModel = shown.drift;

  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...(d ?? saved), ...patch }));
  const changeDrift = (next: DriftModel) => change({ drift: next });

  async function commit() {
    if (!draft) return;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (draft.hand !== saved.hand) onHandednessChange(draft.hand);
    if (draft.grip !== saved.grip) await setGripStyle(draft.grip);
    if (!same(draft.pap, saved.pap)) await setPap(draft.pap);
    if (!same(draft.drift, saved.drift)) onDriftModelChange(draft.drift);
    setDraft(null);
  }

  function setReleaseOffset(v: number) {
    changeDrift({ ...driftModel, release_offset: v });
  }

  function setOutsideMax(v: number) {
    // Guard invariant: keep the middle zone at least 1 board wide.
    const clamped = Math.max(1, Math.min(v, driftModel.inside_min - 2));
    if (clamped !== driftModel.outside_max) changeDrift({ ...driftModel, outside_max: clamped });
  }

  function setInsideMin(v: number) {
    const clamped = Math.min(BOARD_MAX, Math.max(v, driftModel.outside_max + 2));
    if (clamped !== driftModel.inside_min) changeDrift({ ...driftModel, inside_min: clamped });
  }

  function setDrift(zone: keyof DriftModel["drift"], v: number) {
    changeDrift({ ...driftModel, drift: { ...driftModel.drift, [zone]: v } });
  }

  const zoneRange: Record<(typeof ZONES)[number], string> = {
    outside: `1 to ${driftModel.outside_max}`,
    middle: `${driftModel.outside_max + 0.5} to ${driftModel.inside_min - 0.5}`,
    inside: `${driftModel.inside_min} to ${BOARD_MAX}`
  };

  const body = (
    // Reading, every control is off, which would leave the scrolling page with
    // nothing to focus by keyboard; the page itself takes the stop.
    <div tabIndex={editing ? undefined : 0} className="outline-none focus-visible:ring-2 focus-visible:ring-accent-fill">
    <fieldset
      disabled={!editing}
      aria-label="Bowling profile"
      // A read page lets scrolling pass over every control without touching it.
      className={`mx-auto w-full max-w-3xl min-w-0 space-y-7 border-0 px-3 py-4 sm:px-6 ${editing ? "" : "[&_*]:pointer-events-none"}`}
    >
      <div>
        <h2 className={GROUP_HEADING}>Handedness</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          Switching flips every board number. Saved sessions keep theirs.
        </p>
        <HandednessPicker value={value} onSelect={(next) => change({ hand: next })} />
      </div>

      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Grip</h2>
        <SegmentedControl
          label="Grip style"
          value={grip}
          onChange={(next) => change({ grip: next })}
          options={[
            { value: "1h", label: "One-handed" },
            { value: "2h", label: "Two-handed" }
          ]}
        />
      </div>

      <Group
        heading="Your PAP"
        description="Measured from the center of your grip. Your pro shop can measure it for you."
      >
        <div className="space-y-2 rounded-xl border border-edge bg-surface p-3">
          <PapEditor pap={pap} onChange={(next) => change({ pap: next })} idPrefix="settings-pap" />
        </div>
      </Group>

      <Group
        heading="Release offset"
        description="How many boards from your slide foot the ball lands."
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
        <LinePanelFigure />
      </Group>

      <Group
        heading="Drift"
        description="How many boards you drift, left or right, from your stance to your finishing slide position. With your release offset, the lane view uses it to work out your slide and laydown, based on the stance you enter."
      >
        <DriftZoneLane
          model={driftModel}
          hand={value}
          onOutsideMaxChange={editing ? setOutsideMax : undefined}
          onInsideMinChange={editing ? setInsideMin : undefined}
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
    </fieldset>
    </div>
  );

  if (!onBack) return body;

  return (
    <PushScreen
      mode="inline"
      title="Bowling profile"
      onBack={onBack}
      trailing={
        editing ? (
          <IconButton variant="confirm" label="Save bowling profile" onClick={() => void commit()}>
            <Check size={20} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton variant="round" label="Edit bowling profile" onClick={() => setDraft(saved)}>
            <Pencil size={18} aria-hidden="true" />
          </IconButton>
        )
      }
    >
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

/**
 * The scorer's line fields as they look when a shot is entered: the intended
 * stance and target, with the slide and laydown worked out from them. It is a
 * picture of the real panel (`npm run shots`), so the page can show what the
 * offset and drift below it are for without a paragraph about it. One picture
 * per theme, switched with the app's own theme attribute.
 */
function LinePanelFigure() {
  const alt =
    "The scorer's line fields: intended stance 24 and target 10, with slide 24 and laydown 18 worked out from them.";
  return (
    <figure className="mt-3">
      <img
        src="/help/line-panel-light.png"
        width={352}
        height={236}
        alt={alt}
        className="h-auto w-44 rounded-xl border border-edge dark:hidden"
      />
      <img
        src="/help/line-panel-dark.png"
        width={352}
        height={236}
        alt={alt}
        className="hidden h-auto w-44 rounded-xl border border-edge dark:block"
      />
    </figure>
  );
}
