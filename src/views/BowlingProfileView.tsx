import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, plural, t } from "@lingui/core/macro";
import { Check, ChevronLeft, ChevronRight, Info, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PapEditor } from "../components/PapEditor";
import { IconButton } from "../components/ui/IconButton";
import { DEFAULT_PAP, formatInches } from "../lib/ballLayout";
import { formatNumber } from "../lib/format";
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

/** A zone of the approach the drift is set for, and the words that move its drift. */
function zoneLabel(zone: (typeof ZONES)[number]): string {
  if (zone === "outside") return t({ message: "Outside", comment: "Bowling term: the outside zone of the lane, near the gutter. A zone name in the drift settings." });
  if (zone === "middle") return t({ message: "Middle", comment: "Bowling term: the middle zone of the lane. A zone name in the drift settings." });
  return t({ message: "Inside", comment: "Bowling term: the inside zone of the lane, toward the center. A zone name in the drift settings." });
}

function zoneDriftMove(zone: (typeof ZONES)[number], side: "left" | "right"): string {
  if (zone === "outside") return side === "left" ? t`Move outside drift left` : t`Move outside drift right`;
  if (zone === "middle") return side === "left" ? t`Move middle drift left` : t`Move middle drift right`;
  return side === "left" ? t`Move inside drift left` : t`Move inside drift right`;
}

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
      aria-label={t`Bowling profile`}
      // A read page lets scrolling pass over every control without touching it.
      className={`mx-auto w-full max-w-3xl min-w-0 space-y-7 border-0 px-3 py-4 sm:px-6 ${editing ? "" : "[&_*]:pointer-events-none"}`}
    >
      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>{t`Handedness`}</h2>
        {editing ? (
          <HandednessPicker value={value} onSelect={(next) => change({ hand: next })} />
        ) : (
          <ReadValue>{value === "right" ? t`Right-handed` : t`Left-handed`}</ReadValue>
        )}
      </div>

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>{t({ message: "Grip", comment: "How the bowler holds the ball: one-handed or two-handed" })}</h2>
        {editing ? (
          <SegmentedControl
            label={t`Grip style`}
            value={grip}
            onChange={(next) => change({ grip: next })}
            options={[
              { value: "1h", label: t`One-handed` },
              { value: "2h", label: t`Two-handed` }
            ]}
          />
        ) : (
          <ReadValue>{grip === "2h" ? t`Two-handed` : t`One-handed`}</ReadValue>
        )}
      </div>

      <Group
        heading={t({ message: "Your PAP", comment: "Bowling term: PAP is the positive axis point, a measurement of the bowler's axis of rotation" })}
        aboutLabel={t`About your PAP`}
      >
        {editing ? (
          <div className="space-y-2 rounded-xl border border-edge bg-surface p-3">
            <PapEditor pap={pap} onChange={(next) => change({ pap: next })} idPrefix="settings-pap" />
          </div>
        ) : (
          <ReadValue>
            {pap.up < 0
              ? t({ message: `${{ over: formatInches(pap.over) }} over, ${{ down: formatInches(Math.abs(pap.up)) }} down`, comment: "Bowling term: PAP (positive axis point) written as inches over and inches down from the center of the grip" })
              : t({ message: `${{ over: formatInches(pap.over) }} over, ${{ up: formatInches(Math.abs(pap.up)) }} up`, comment: "Bowling term: PAP (positive axis point) written as inches over and inches up from the center of the grip" })}
          </ReadValue>
        )}
      </Group>

      <Group
        heading={t({ message: "Release offset", comment: "Bowling term: how many boards from the slide foot the ball is released toward the bowling hand" })}
        aboutLabel={t`About release offset`}
        onInfo={() => setInfoOpen(true)}
      >
        {editing ? (
          <div className="rounded-xl border border-edge bg-surface px-3">
            <Row label={t({ message: "Offset", comment: "Short for release offset, a bowling term" })} hint={t`boards`}>
              <Stepper
                decreaseLabel={t`Decrease release offset`}
                increaseLabel={t`Increase release offset`}
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
            {plural(driftModel.release_offset, { one: "# board", other: "# boards" })}
          </ReadValue>
        )}
      </Group>

      <Group
        heading={t({ message: "Drift", comment: "Bowling term: how far the bowler's feet move sideways during the approach" })}
        aboutLabel={t`About drift`}
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
                  <span className="text-sm font-semibold capitalize text-ink">{zoneLabel(zone)}</span>
                  <div className="ml-auto shrink-0">
                    <DriftStepper
                      zone={zone}
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
      title={t`Bowling profile`}
      onBack={onBack}
      trailing={
        editing ? (
          <IconButton variant="confirm" label={t`Save bowling profile`} onClick={() => void commit()}>
            <Check size={20} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton variant="round" label={t`Edit bowling profile`} onClick={() => setDraft({})}>
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
  aboutLabel,
  onInfo,
  children
}: {
  heading: string;
  /** What a screen reader calls the info button. */
  aboutLabel: string;
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
            label={aboutLabel}
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

/** Label on the left, control flush right: one grid for every input on the page.
 *  Where the two do not fit on one line (a narrow phone at a large text size),
 *  the control wraps under the label, still flush right, rather than running
 *  out of the card. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[3rem] flex-wrap items-center gap-x-3 gap-y-1 py-1">
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
  zone,
  value,
  hand,
  onChange
}: {
  zone: (typeof ZONES)[number];
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
        aria-label={zoneDriftMove(zone, "left")}
        onClick={() => nudge(leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-ink">
        {dir === "none" ? t`None` : dir === "left" ? t`${{ boards: formatNumber(Math.abs(value), 1) }} left` : t`${{ boards: formatNumber(Math.abs(value), 1) }} right`}
      </span>
      <button
        type="button"
        aria-label={zoneDriftMove(zone, "right")}
        onClick={() => nudge(-leftStep)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function Stepper({
  decreaseLabel,
  increaseLabel,
  value,
  step,
  min,
  max,
  onChange
}: {
  decreaseLabel: string;
  increaseLabel: string;
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
        aria-label={decreaseLabel}
        onClick={() => onChange(Math.max(min, value - step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="w-28 text-center text-sm font-bold tabular-nums text-ink">{formatNumber(value, 1)}</span>
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(Math.min(max, value + step))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-secondary hover:bg-surface-muted"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The words on the scorer's line, each named and said in one line. */
const LINE_TERMS: ReadonlyArray<{ term: MessageDescriptor; meaning: MessageDescriptor }> = [
  { term: msg({ message: "Stance", comment: "Bowling term: the board your slide foot starts on" }), meaning: msg`The board your slide foot starts on.` },
  { term: msg({ message: "Target", comment: "Bowling term: the board you aim at" }), meaning: msg`The board you aim at, usually an arrow.` },
  { term: msg({ message: "Drift", comment: "Bowling term: how far the bowler's feet move sideways during the approach" }), meaning: msg`How many boards your feet move between stance and slide.` },
  { term: msg({ message: "Slide", comment: "Bowling term: the board the slide foot finishes on" }), meaning: msg`The board your slide foot finishes on: your stance, moved by your drift.` },
  { term: msg({ message: "Release offset", comment: "Bowling term: how many boards from the slide foot the ball is released toward the bowling hand" }), meaning: msg`How many boards from your slide foot, toward your bowling hand, the ball lands.` },
  { term: msg({ message: "Laydown", comment: "Bowling term: the board the ball first touches the lane" }), meaning: msg`The board the ball lands on: your slide, moved by your release offset.` }
];

const EXAMPLE_STEPS: ReadonlyArray<{ label: MessageDescriptor; board: string }> = [
  { label: msg({ message: "Stance", comment: "Bowling term: the board your slide foot starts on" }), board: "24" },
  { label: msg({ message: "Slide", comment: "Bowling term: the board the slide foot finishes on" }), board: "24" },
  { label: msg({ message: "Laydown", comment: "Bowling term: the board the ball first touches the lane" }), board: "18" }
];

/**
 * What the release offset and drift are for: each term on the scorer's line
 * with what it means, then one worked example drawn from the page's own
 * chrome. It replaced a screenshot of the scorer's fields on a tinted mat,
 * which read as a field cut out of another screen.
 */
function LinePanelInfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <FormSheet title={t`Your line`} onClose={onClose} dismissAs="done">
      <div className="space-y-5">
        <p className="text-sm text-ink-secondary">
          {t`You enter your stance and target. The app works out your slide and laydown.`}
        </p>
        <dl className="space-y-3">
          {LINE_TERMS.map(({ term, meaning }) => (
            <div key={term.id}>
              <dt className="text-subhead font-semibold text-ink">{i18n._(term)}</dt>
              <dd className="text-sm text-ink-secondary">{i18n._(meaning)}</dd>
            </div>
          ))}
        </dl>
        <figure className="rounded-2xl border border-edge bg-surface p-4">
          <figcaption className="text-xs font-semibold text-ink-secondary">
            {t`Example: no drift, release offset 6`}
          </figcaption>
          <ol className="mt-3 flex items-center justify-between gap-1 text-center">
            {EXAMPLE_STEPS.map(({ label, board }, n) => (
              <li key={label.id} className="flex items-center gap-1">
                {n > 0 && <ChevronRight size={16} aria-hidden="true" className="text-ink-tertiary" />}
                <span className="min-w-16 rounded-xl bg-surface-muted px-3 py-2">
                  <span className="block text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">
                    {i18n._(label)}
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
