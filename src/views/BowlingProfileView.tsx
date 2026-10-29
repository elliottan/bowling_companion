import { Check, ChevronLeft, ChevronRight, Info, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
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
import { SETTING_HEADING } from "../components/ui/typography";
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

/** Set the first time the page opens. Kept on the device, like the theme: it is
 *  a fact about this install's first look at the page, not part of the bowler's
 *  data, so it stays out of the database and out of backups. */
const OPENED_KEY = "profileOpened";

/** Whether the page has been opened before. A device that cannot say counts as
 *  having opened it, so the worst a failed read costs is the read-only view. */
function hasOpenedProfile(): boolean {
  try {
    return localStorage.getItem(OPENED_KEY) === "1";
  } catch {
    return true;
  }
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
  // page first drops the draft. The very first visit opens straight into
  // editing, since an unset profile is the reason to be here; every one after
  // that reads.
  const [draft, setDraft] = useState<Partial<Draft> | null>(() => (hasOpenedProfile() ? null : {}));
  useEffect(() => {
    try {
      localStorage.setItem(OPENED_KEY, "1");
    } catch {
      // Private mode: the next visit opens in edit mode again, which is harmless.
    }
  }, []);
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
        <h2 className={`mb-3 ${SETTING_HEADING}`}>Handedness</h2>
        {editing ? (
          <HandednessPicker value={value} onSelect={(next) => change({ hand: next })} />
        ) : (
          <ReadValue>{value === "right" ? "Right-handed" : "Left-handed"}</ReadValue>
        )}
      </div>

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>Grip</h2>
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
      >
        <DriftZoneLane
          model={driftModel}
          hand={value}
          onOutsideMaxChange={editing ? setOutsideMax : undefined}
          onInsideMinChange={editing ? setInsideMin : undefined}
        />

        {editing && (
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
              </div>
            ))}
          </div>
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
 *  the answer under its heading. The
 *  controls come back with the pencil. */
function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="text-base font-semibold text-accent">{children}</p>;
}

/**
 * A titled block of the page: the setting's name, an info button where it
 * needs explaining, and its control. No sentence under the name; the info
 * sheet carries the explanation for the two that need one.
 */
function Group({
  heading,
  onInfo,
  children
}: {
  heading: string;
  /** Opens the explanation for the block, from an info button on the heading. */
  onInfo?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1">
        <h2 className={SETTING_HEADING}>{heading}</h2>
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

/** The words on the scorer's line, each named and said in one line. */
const LINE_TERMS: ReadonlyArray<{ term: string; meaning: string }> = [
  { term: "Stance", meaning: "The board your slide foot starts on." },
  { term: "Target", meaning: "The board you aim at, usually an arrow." },
  { term: "Drift", meaning: "How many boards your feet move between stance and slide." },
  { term: "Slide", meaning: "The board your slide foot finishes on: your stance, moved by your drift." },
  { term: "Release offset", meaning: "How many boards from your slide foot, toward your bowling hand, the ball lands." },
  { term: "Laydown", meaning: "The board the ball lands on: your slide, moved by your release offset." }
];

/**
 * What the release offset and drift are for: each term on the scorer's line
 * with what it means, then one worked example drawn from the page's own
 * chrome. It replaced a screenshot of the scorer's fields on a tinted mat,
 * which read as a field cut out of another screen.
 */
function LinePanelInfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <FormSheet title="Your line" onClose={onClose} dismissAs="done">
      <div className="space-y-5">
        <p className="text-sm text-ink-secondary">
          You enter your stance and target. The app works out your slide and laydown.
        </p>
        <dl className="space-y-3">
          {LINE_TERMS.map(({ term, meaning }) => (
            <div key={term}>
              <dt className="text-subhead font-semibold text-ink">{term}</dt>
              <dd className="text-sm text-ink-secondary">{meaning}</dd>
            </div>
          ))}
        </dl>
        <figure className="rounded-2xl border border-edge bg-surface p-4">
          <figcaption className="text-xs font-semibold text-ink-secondary">
            Example: no drift, release offset 6
          </figcaption>
          <ol className="mt-3 flex items-center justify-between gap-1 text-center">
            {[
              ["Stance", "24"],
              ["Slide", "24"],
              ["Laydown", "18"]
            ].map(([label, board], n) => (
              <li key={label} className="flex items-center gap-1">
                {n > 0 && <ChevronRight size={16} aria-hidden="true" className="text-ink-tertiary" />}
                <span className="min-w-16 rounded-xl bg-surface-muted px-3 py-2">
                  <span className="block text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">
                    {label}
                  </span>
                  <span className="block text-lg font-bold tabular-nums text-ink">{board}</span>
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </FormSheet>
  );
}
