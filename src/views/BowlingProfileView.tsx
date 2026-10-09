import { Check, ChevronLeft, ChevronRight, Info, Pencil } from "lucide-react";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PapEditor } from "../components/PapEditor";
import { IconButton } from "../components/ui/IconButton";
import { DEFAULT_PAP, formatInches } from "../lib/ballLayout";
import type { PapMeasurement } from "../lib/ballLayout";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";
import { PushScreen } from "../components/PushScreen";
import { DriftZoneLane, ZONE_ACCENT } from "../components/DriftZoneLane";
import { HandednessPicker } from "../components/HandednessPicker";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import type { GripStyle, Handedness } from "../types/bowling";
import { driftDirection, type DriftModel } from "../lib/driftModel";
import { GROUP_HEADING } from "../components/ui/typography";
import { FormSheet } from "../components/ui/FormSheet";

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
  const [draft, setDraft] = useState<Partial<Draft> | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const editing = draft !== null;
  const saved: Draft = { hand: handedness, grip: savedGrip, pap: savedPap, drift: savedDrift };
  // Only what was changed is held, so a value that finishes loading after the
  // pencil is pressed still shows through.
  const shown: Draft = { ...saved, ...draft };
  const value = shown.hand;
  const grip = shown.grip;
  const pap = shown.pap;
  const driftModel = shown.drift;

  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));
  const changeDrift = (next: DriftModel) => change({ drift: next });

  async function commit() {
    if (!draft) return;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (draft.hand !== undefined && draft.hand !== saved.hand) onHandednessChange(draft.hand);
    if (draft.grip !== undefined && draft.grip !== saved.grip) await setGripStyle(draft.grip);
    if (draft.pap !== undefined && !same(draft.pap, saved.pap)) await setPap(draft.pap);
    if (draft.drift !== undefined && !same(draft.drift, saved.drift)) onDriftModelChange(draft.drift);
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
    <div
      role="group"
      aria-label="Bowling profile"
      // A read page lets scrolling pass over every control without touching it.
      className={`mx-auto w-full max-w-3xl min-w-0 space-y-7 border-0 px-3 py-4 sm:px-6 ${editing ? "" : "[&_*]:pointer-events-none"}`}
    >
      <div>
        <h2 className={GROUP_HEADING}>Handedness</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          Switching flips every board number. Saved sessions keep theirs.
        </p>
        {editing ? (
          <HandednessPicker value={value} onSelect={(next) => change({ hand: next })} />
        ) : (
          <ReadValue>{value === "right" ? "Right-handed" : "Left-handed"}</ReadValue>
        )}
      </div>

      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Grip</h2>
        {editing ? (
          <SegmentedControl
            label="Grip style"
            value={grip}
            onChange={(next) => change({ grip: next })}
            options={[
              { value: "1h", label: "One-handed" },
              { value: "2h", label: "Two-handed" }
            ]}
          />
        ) : (
          <ReadValue>{grip === "2h" ? "Two-handed" : "One-handed"}</ReadValue>
        )}
      </div>

      <Group
        heading="Your PAP"
        description="Measured from the center of your grip. Your pro shop can measure it for you."
      >
        {editing ? (
          <div className="space-y-2 rounded-xl border border-edge bg-surface p-3">
            <PapEditor pap={pap} onChange={(next) => change({ pap: next })} idPrefix="settings-pap" />
          </div>
        ) : (
          <ReadValue>
            {formatInches(pap.over)} over, {formatInches(Math.abs(pap.up))} {pap.up < 0 ? "down" : "up"}
          </ReadValue>
        )}
      </Group>

      <Group
        heading="Release offset"
        onInfo={() => setInfoOpen(true)}
        description="How many boards from your slide foot the ball lands."
      >
        {editing ? (
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
        ) : (
          <ReadValue>
            {driftModel.release_offset} {driftModel.release_offset === 1 ? "board" : "boards"}
          </ReadValue>
        )}
      </Group>

      <Group
        heading="Drift"
        onInfo={() => setInfoOpen(true)}
        description="How many boards you drift, left or right, from your stance to your finishing slide position. With your release offset, the lane view uses it to work out your slide and laydown, based on the stance you enter."
      >
        <DriftZoneLane
          model={driftModel}
          hand={value}
          onOutsideMaxChange={editing ? setOutsideMax : undefined}
          onInsideMinChange={editing ? setInsideMin : undefined}
        />

        {editing ? (
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
        ) : (
          // Read, a zone is its name and its sentence: no box, no stepper.
          <ul className="mt-3 space-y-2">
            {ZONES.map((zone) => (
              <li key={zone} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ZONE_ACCENT[zone].swatch}`}
                  aria-hidden="true"
                />
                <p className="text-sm text-ink">
                  <span className="font-semibold capitalize">{zone}.</span>{" "}
                  {describeDrift(driftModel.drift[zone], value, zoneRange[zone])}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
    </div>
  );

  const info = infoOpen && <LinePanelInfoSheet onClose={() => setInfoOpen(false)} />;

  if (!onBack) {
    return (
      <>
        {body}
        {info}
      </>
    );
  }

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
          <IconButton variant="round" label="Edit bowling profile" onClick={() => setDraft({})}>
            <Pencil size={18} aria-hidden="true" />
          </IconButton>
        )
      }
    >
      {body}
      {info}
    </PushScreen>
  );
}

/** A value on the page while it is only being read: plain text, with nothing
 *  around it that looks like a field. It takes the accent colour so it reads as
 *  the answer under its heading, apart from the grey description above it. The
 *  controls come back with the pencil. */
function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="text-base font-semibold text-accent">{children}</p>;
}

/**
 * A titled block of the page. The heading is the app's one group heading band
 * rather than a third heading size invented here: three sections each opening
 * with their own bold line read as three pages stacked, not as one screen.
 */
function Group({
  heading,
  description,
  onInfo,
  children
}: {
  heading: string;
  description: React.ReactNode;
  /** Opens the explanation for the block, from an info button on the heading. */
  onInfo?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1">
        <h2 className={GROUP_HEADING}>{heading}</h2>
        {onInfo && (
          <IconButton
            compact
            label={`About ${heading.toLowerCase()}`}
            onClick={onInfo}
            // The read page lets scrolling pass over everything; this is the
            // one thing on it that is meant to be tapped.
            className="!pointer-events-auto"
          >
            <Info size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
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
 * What the release offset and drift are for, with a picture of the scorer's
 * line fields between the two halves of the explanation. The picture sits on a
 * tinted mat with a caption: bare, a screenshot of fields looks like fields on
 * this page, and the page is read-only until the pencil. It is a picture of the
 * real panel (`npm run shots`), one per theme, switched with the app's own
 * theme attribute.
 */
function LinePanelInfoSheet({ onClose }: { onClose: () => void }) {
  const alt =
    "The scorer's line fields: intended stance 24 and target 10, with slide 24 and laydown 18 worked out from them.";
  return (
    <FormSheet title="Your line" onClose={onClose} dismissAs="done">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-secondary">
          In score entry you say where you stand and where you aim. The app works out where
          your foot finishes and where the ball lands.
        </p>
        <figure className="pointer-events-none select-none rounded-2xl bg-surface-muted p-4">
          <img
            src="/help/line-panel-light.png"
            width={352}
            height={236}
            alt={alt}
            draggable={false}
            className="mx-auto h-auto w-44 rounded-xl dark:hidden"
          />
          <img
            src="/help/line-panel-dark.png"
            width={352}
            height={236}
            alt={alt}
            draggable={false}
            className="mx-auto hidden h-auto w-44 rounded-xl dark:block"
          />
          <figcaption className="mt-3 text-center text-xs text-ink">
            Picture from score entry
          </figcaption>
        </figure>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Slide comes from your stance and your drift. Laydown is your slide moved by your
          release offset.
        </p>
      </div>
    </FormSheet>
  );
}
