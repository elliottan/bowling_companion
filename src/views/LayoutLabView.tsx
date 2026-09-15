import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Info, MoreHorizontal, RotateCcw, Share2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { BallLayoutDiagram } from "../components/BallLayoutDiagram";
import { PushScreen } from "../components/PushScreen";
import { AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import { Chip } from "../components/ui/Chip";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { FIELD_DENSE, FIELD_DENSE_SELECT, FIELD_MICRO_LABEL } from "../components/ui/field";
import { GROUP_HEADING } from "../components/ui/typography";
import {
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  DO_NOT_USE_BAND,
  EIGHTHS,
  LAYOUT_PRESETS,
  clamp,
  coreToPap,
  formatDualAngle,
  formatInches,
  formatVls,
  fromVls,
  inDoNotUseBand,
  joinInches,
  layoutGeometry,
  pinBuffer,
  presetLayout,
  readMotion,
  splitInches,
  toVls,
  type BallSpec,
  type DualAngleLayout,
  type InchParts,
  type LayoutPreset,
  type PapMeasurement
} from "../lib/ballLayout";
import { defaultOrientationFor, orientationFacing, type Orientation } from "../lib/ballProjection";
import { decodeLayoutParams, layoutShareUrl } from "../lib/layoutShare";
import { getHandedness, getPap, setPap as savePap } from "../services/bowlingRepository";
import { useHandedness } from "../lib/handednessContext";
import type { Handedness } from "../types/bowling";

interface LayoutLabViewProps {
  onBack: () => void;
}

/** The two ways to write the same layout. */
type System = "dual" | "vls";

/** The page's query string, guarded for a render with no window behind it. */
function currentSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

const BENCHMARK: DualAngleLayout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

/**
 * The layout lab: three numbers, a ball you can turn, and what the ball will do.
 *
 * It holds nothing and saves nothing, which is deliberate. This is the ball
 * equivalent of the line sandbox: a place to find out what a layout does before
 * committing to one, not a record of a layout you own. A ball's actual layout
 * is a field on the ball in the arsenal.
 *
 * The screen is arranged in the order the question gets asked: what ball, what
 * numbers, what does it look like, what will it do. The diagram sits directly
 * under the sliders rather than at the top, because the sliders are what the
 * thumb is on and a picture above them would be the thing scrolled off screen.
 */
export function LayoutLabView({ onBack }: LayoutLabViewProps) {
  // A link shared into the app wins over everything, and it is read once at
  // module level of this render rather than in an effect: it is available
  // synchronously, so seeding state from it needs no second render and no
  // flash of the defaults before the shared layout arrives.
  const shared = useMemo(() => decodeLayoutParams(currentSearch()), []);

  const [symmetric, setSymmetric] = useState(shared ? shared.ball.symmetric : false);
  const [layout, setLayout] = useState<DualAngleLayout>(shared?.layout ?? BENCHMARK);
  const [system, setSystem] = useState<System>("dual");
  // Null means "wherever this hand's layout opens", so the camera can follow a
  // handedness that arrives asynchronously from settings without an effect
  // reaching back into state after the fact.
  const [turnedTo, setTurnedTo] = useState<Orientation | null>(null);
  // Off by default. The rings are what the layout produces rather than part of
  // it, and five great circles behind two measured lines is a lot of ink to
  // put on screen before anyone asks for it.
  const [showFlare, setShowFlare] = useState(false);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const [pendingPreset, setPendingPreset] = useState<LayoutPreset | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // The bowler's own two numbers come from their settings, so nobody re-types
  // their axis or their hand on every visit. A shared link overrides both:
  // someone else's layout is only a layout when it is read against the axis it
  // was drilled for.
  const appHand = useHandedness();
  const storedPap = useLiveQuery(getPap, [], undefined);
  const storedHand = useLiveQuery(getHandedness, [], undefined);

  const [papOverride, setPapOverride] = useState<PapMeasurement | null>(shared?.pap ?? null);
  const [handOverride, setHandOverride] = useState<Handedness | null>(shared?.hand ?? null);

  const pap = papOverride ?? storedPap ?? DEFAULT_PAP;
  const hand: Handedness = handOverride ?? storedHand ?? appHand;
  const orientation = turnedTo ?? defaultOrientationFor(hand);
  const setOrientation = setTurnedTo;

  // Switching hand mirrors the ball, so the camera goes back to this hand's
  // opening view rather than leaving the layout facing away.
  const chooseHand = useCallback((next: Handedness) => {
    setHandOverride(next);
    setTurnedTo(null);
  }, []);

  const ball: BallSpec = useMemo(() => {
    const base = symmetric ? DEFAULT_SYMMETRIC : DEFAULT_ASYMMETRIC;
    // A shared link carries the ball's own pin-to-PSA distance, because two
    // balls with the same three numbers and different distances are two
    // different layouts. It applies only to the core type it was shared for:
    // switching to the other core is asking about a different ball, and that
    // ball's own distance is the one that belongs to it.
    const pinToCore =
      shared && shared.ball.symmetric === symmetric ? shared.ball.pinToCore : base.pinToCore;
    return { ...base, pinToCore };
  }, [symmetric, shared]);

  // Editing the PAP writes it back, because it is the bowler's measurement and
  // not this screen's scratch value: the whole point of storing it is that the
  // next visit, and every other screen that ever wants it, already knows.
  // A PAP that arrived in a shared link is somebody else's and is never saved.
  const fromLink = shared != null;
  const updatePap = useCallback(
    (next: PapMeasurement) => {
      setPapOverride(next);
      if (!fromLink) void savePap(next);
    },
    [fromLink]
  );

  const motion = useMemo(() => readMotion(layout, ball, pap), [layout, ball, pap]);
  const vls = useMemo(() => toVls(layout, ball), [layout, ball]);
  const geometry = useMemo(() => layoutGeometry(layout, ball, pap, hand), [layout, ball, pap, hand]);

  const set = useCallback(
    (patch: Partial<DualAngleLayout>) => setLayout((l) => ({ ...l, ...patch })),
    []
  );

  // Editing a VLS number is editing the layout: it converts back through the
  // same geometry, so the two sets of sliders are two views of one state rather
  // than two states kept in step. There is nothing to drift.
  const setVls = useCallback(
    (patch: Partial<{ pinToPap: number; psaToPap: number; pinBuffer: number }>) => {
      setLayout((l) => {
        const current = toVls(l, ball);
        const next = fromVls(
          {
            pinToPap: patch.pinToPap ?? current.pinToPap,
            psaToPap: patch.psaToPap ?? current.psaToPap,
            pinBuffer: patch.pinBuffer ?? current.pinBuffer
          },
          ball
        );
        return { drillingAngle: next.drillingAngle, pinToPap: next.pinToPap, valAngle: next.valAngle };
      });
    },
    [ball]
  );

  const face = (target: keyof typeof targets) => () => setOrientation(orientationFacing(targets[target]));
  const targets = {
    grip: geometry.gripCenter,
    pin: geometry.pin,
    pap: geometry.pap,
    core: geometry.core
  };

  // Share. A link rather than a picture: a picture of a layout cannot be
  // opened, adjusted and sent back, and this screen is for adjusting.
  const share = useCallback(async () => {
    setMenuAt(null);
    const url = layoutShareUrl(
      { layout, ball, pap, hand },
      window.location.origin,
      window.location.pathname
    );
    const title = `Layout ${formatDualAngle(layout)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch {
      // A dismissed share sheet rejects, and so does a clipboard the browser
      // will not grant. Neither is an error worth a dialog, but silence would
      // read as a dead button, so the one case that leaves nothing behind says
      // so and the user can still read the link off the address bar.
      setShareNote("Could not share. The link is in this screen's address.");
    }
  }, [layout, ball, pap, hand]);

  // The share note says one thing and then goes, rather than sitting there
  // until something else happens to clear it.
  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(null), 2600);
    return () => clearTimeout(t);
  }, [shareNote]);

  const applyPreset = useCallback(
    (preset: LayoutPreset) => {
      setLayout(presetLayout(preset, ball));
      setPendingPreset(null);
      setMenuAt(null);
    },
    [ball]
  );

  const activePreset = LAYOUT_PRESETS.find((p) => {
    const l = presetLayout(p, ball);
    return (
      Math.abs(l.drillingAngle - layout.drillingAngle) < 0.5 &&
      Math.abs(l.pinToPap - layout.pinToPap) < 0.02 &&
      Math.abs(l.valAngle - layout.valAngle) < 0.5
    );
  });

  /**
   * Choosing a preset replaces whatever is on screen, so it asks first.
   *
   * It asks only when there is something to lose. Sitting on one preset and
   * picking another discards nothing the bowler typed, and a dialog there would
   * be asking a question whose answer is always yes, which is the fastest way
   * to teach someone to dismiss dialogs without reading them. Custom numbers
   * are different: those took work and nothing else on this screen can bring
   * them back.
   */
  const choosePreset = useCallback(
    (preset: LayoutPreset) => {
      if (activePreset) applyPreset(preset);
      else {
        setMenuAt(null);
        setPendingPreset(preset);
      }
    },
    [activePreset, applyPreset]
  );

  return (
    <PushScreen
      title="Layout lab"
      onBack={onBack}
      /* Escape belongs to whatever is layered on top. Without this the menu's
         own Escape and the screen's both fired, so dismissing the menu also
         popped the screen out from under it. */
      active={pendingPreset == null && menuAt == null}
      /* One trailing action, per docs/DESIGN-LANGUAGE.md section 1. The presets
         and the share both live behind it: neither is touched on most visits,
         and a row of five preset chips was taking a block of the screen to say
         what a menu says in one glyph. */
      trailing={
        <IconButton
          variant="round"
          label="More"
          onClick={(e) => {
            // Anchored off the event's own target rather than a ref, because
            // IconButton is a plain function component and does not forward one.
            const r = e.currentTarget.getBoundingClientRect();
            // The menu is 11rem wide and hangs from the button's trailing edge,
            // clamped so it cannot run off a narrow screen.
            setMenuAt({ left: Math.max(8, r.right - 176), top: r.bottom + 6 });
          }}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </IconButton>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-5 px-3 py-4 sm:px-6">
        {/* 1. Whose ball this is. The PAP leads because it is the frame every
            other number is measured against: the VAL angle is measured at it
            and the pin-to-PAP distance is measured to it, so a layout read
            against the wrong axis is the wrong layout. It used to sit last on
            the grounds that it is set once and then left alone, which is true
            of how often it is touched and wrong about what it means. */}
        <section className="space-y-2">
          <h2 className={GROUP_HEADING}>Your PAP</h2>
          <div className="space-y-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
            <InchField
              label="Over"
              id="pap-over"
              value={pap.over}
              maxWhole={6}
              onChange={(over) => updatePap({ ...pap, over: clamp(over, 0, 6.5) })}
            />
            <InchField
              label="Up or down"
              id="pap-up"
              value={pap.up}
              maxWhole={3}
              signed
              onChange={(up) => updatePap({ ...pap, up: clamp(up, -3, 3) })}
            />
            <div>
              <span className={FIELD_MICRO_LABEL}>Hand</span>
              <SegmentedControl
                label="Bowling hand"
                value={hand}
                onChange={chooseHand}
                options={[
                  { value: "right", label: "Right" },
                  { value: "left", label: "Left" }
                ]}
              />
            </div>
          </div>
        </section>

        {/* 2. What ball. The core type comes before the numbers because it
            changes what the drilling angle means, and therefore what every
            number below does. */}
        <section className="space-y-2">
          <h2 className={GROUP_HEADING}>Core</h2>
          <SegmentedControl
            label="Core type"
            value={symmetric ? "sym" : "asym"}
            onChange={(v) => setSymmetric(v === "sym")}
            options={[
              { value: "asym", label: "Asymmetric" },
              { value: "sym", label: "Symmetric" }
            ]}
          />
        </section>

        {/* 3. The numbers. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className={GROUP_HEADING}>Layout</h2>
            <button
              type="button"
              onClick={() => {
                // Resets the layout, not the bowler. The PAP and the hand are
                // saved measurements now, so clearing them here would throw
                // away something measured off a real shot to undo some slider
                // dragging. Dropping the overrides is how a shared link gets
                // out of the way and the bowler's own two numbers come back.
                setLayout(BENCHMARK);
                setPapOverride(null);
                setHandOverride(null);
                setTurnedTo(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset
            </button>
          </div>

          <SegmentedControl
            label="Layout system"
            value={system}
            onChange={setSystem}
            options={[
              { value: "dual", label: "Dual angle" },
              { value: "vls", label: "Storm VLS" }
            ]}
          />

          {system === "dual" ? (
            <div className="space-y-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
              <Slider
                label="Drilling angle"
                hint="At the pin, to the CG or PSA. Low rolls early, high rolls late."
                value={layout.drillingAngle}
                min={0}
                max={90}
                step={1}
                unit="deg"
                onChange={(drillingAngle) => set({ drillingAngle })}
              />
              <Slider
                label="Pin to PAP"
                hint="Sets the flare. Peaks around 4 inches and falls away either side."
                value={layout.pinToPap}
                min={0.5}
                max={6}
                step={0.125}
                unit="in"
                warn={inDoNotUseBand(layout.pinToPap)}
                band={DO_NOT_USE_BAND}
                bandMin={0.5}
                bandMax={6}
                onChange={(pinToPap) => set({ pinToPap })}
              />
              <Slider
                label="VAL angle"
                hint="At the PAP, to the axis line. Low is pin up and sharp, high is pin down and smooth."
                value={layout.valAngle}
                min={0}
                max={90}
                step={1}
                unit="deg"
                onChange={(valAngle) => set({ valAngle })}
              />
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
              <Slider
                label="Pin to PAP"
                hint="The same first number in both systems."
                value={vls.pinToPap}
                min={0.5}
                max={6}
                step={0.125}
                unit="in"
                onChange={(pinToPap) => setVls({ pinToPap })}
              />
              {vls.psaToPap == null ? (
                <p className="rounded-lg bg-surface-muted p-2.5 text-xs text-ink-secondary">
                  No PSA on a symmetric ball, so VLS is two numbers here.
                </p>
              ) : (
                <Slider
                  label="PSA to PAP"
                  hint="How fast the ball sheds side roll. This is the drilling angle, written as a distance."
                  value={vls.psaToPap}
                  min={Math.max(0.25, Math.abs(ball.pinToCore - vls.pinToPap))}
                  max={Math.min(6.7, ball.pinToCore + vls.pinToPap)}
                  step={0.125}
                  unit="in"
                  onChange={(psaToPap) => setVls({ psaToPap })}
                />
              )}
              <Slider
                label="Pin buffer"
                hint="Pin to the axis line. Short reads smooth and early, long is stronger off the friction."
                value={vls.pinBuffer}
                min={0}
                max={Math.min(vls.pinToPap, 6)}
                step={0.125}
                unit="in"
                onChange={(buffer) => setVls({ pinBuffer: buffer })}
              />
            </div>
          )}

          {/* Both notations, always, whichever one is being edited. The whole
              point of the toggle is that they are the same layout. */}
          <div className="grid grid-cols-2 gap-2">
            <Readout label="Dual angle" value={formatDualAngle(layout)} />
            <Readout label="Storm VLS" value={formatVls(vls)} />
          </div>

        </section>

        {/* 4. The ball. */}
        <section className="space-y-2">
          <h2 className={GROUP_HEADING}>On the ball</h2>
          <div className="overflow-hidden rounded-xl border border-edge bg-surface-sunken shadow-sm">
            <BallLayoutDiagram
              layout={layout}
              ball={ball}
              pap={pap}
              flareInches={motion.flareInches}
              showFlare={showFlare}
              orientation={orientation}
              onOrientationChange={setOrientation}
              hand={hand}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Chip selected={false} onClick={face("grip")}>Grip</Chip>
            <Chip selected={false} onClick={face("pin")}>Pin</Chip>
            <Chip selected={false} onClick={face("pap")}>PAP</Chip>
            <Chip selected={false} onClick={face("core")}>{ball.symmetric ? "CG" : "PSA"}</Chip>
            <Chip selected={showFlare} onClick={() => setShowFlare((v) => !v)}>
              Flare rings
            </Chip>
          </div>
        </section>

        {/* 5. What it will do. */}
        <section className="space-y-2">
          <h2 className={GROUP_HEADING}>What it will do</h2>
          <div className="space-y-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
            <p className="text-sm text-ink">{motion.summary}</p>
            <Axis label="Flare" value={motion.flare} low="Low" high="High" note={`${motion.flareInches.toFixed(1)}"`} />
            <Axis label="Reads the lane" value={motion.length} low="Early" high="Late" />
            <Axis label="Off the friction" value={motion.angularity} low="Smooth" high="Sharp" />
            <Axis label="Overall strength" value={motion.strength} low="Weak" high="Strong" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Readout label="Pin buffer" value={`${formatInches(pinBuffer(layout.pinToPap, layout.valAngle))}"`} />
            <Readout
              label={`${ball.symmetric ? "CG" : "PSA"} to PAP`}
              value={`${formatInches(coreToPap(layout, ball))}"`}
            />
          </div>

          {motion.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-700"
            >
              {warning}
            </p>
          ))}
        </section>

      </div>

      {menuAt && (
        <AnchoredMenu left={menuAt.left} top={menuAt.top} onClose={() => setMenuAt(null)}>
          <AnchoredMenuItem icon={Share2} onClick={() => void share()}>
            Share layout
          </AnchoredMenuItem>
          {LAYOUT_PRESETS.map((preset) => (
            <AnchoredMenuItem
              key={preset.id}
              icon={activePreset?.id === preset.id ? Check : RotateCcw}
              onClick={() => choosePreset(preset)}
            >
              {preset.name}
            </AnchoredMenuItem>
          ))}
        </AnchoredMenu>
      )}

      <ConfirmDialog
        open={pendingPreset != null}
        title={`Use the ${pendingPreset?.name.toLowerCase() ?? ""} layout?`}
        message={
          <>
            This replaces the layout on screen, {formatDualAngle(layout)}, with{" "}
            {pendingPreset ? formatDualAngle(presetLayout(pendingPreset, ball)) : ""}. Your PAP and
            hand stay as they are.
          </>
        }
        confirmLabel="Replace"
        onConfirm={() => pendingPreset && applyPreset(pendingPreset)}
        onCancel={() => setPendingPreset(null)}
      />

      {shareNote && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4"
        >
          <span className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-surface shadow-lg">
            {shareNote}
          </span>
        </div>
      )}
    </PushScreen>
  );
}

/**
 * A measurement typed the way it is written: whole inches in one box, the
 * fraction in another, and the unit spelled out after both.
 *
 * This replaced a single `type="number"` with `step="0.125"`. Nothing in
 * bowling is measured in decimal inches, so that field asked for a number no
 * bowler has: a PAP is "5 over and a half up", a tape reads in sixteenths, and
 * a drill sheet never carries a decimal point. Worse, the step only bound the
 * spinner arrows, so the keyboard would happily take 5.31 and the ball would
 * quietly move to an axis no pro shop could measure.
 *
 * So the decimal is not accepted rather than rounded away: the whole-inch box
 * is a text input filtered to digits, which cannot hold a point at all, and the
 * fraction is a select whose only options are the eighths. Every value the pair
 * can produce is a value someone could mark on a ball.
 *
 * The fraction may be left blank, which is the whole inch. `signed` adds the
 * direction control for a measurement that can sit either side of the midline;
 * the sign rides the whole measurement rather than its integer part, because
 * half an inch below the line cannot be written as a negative zero.
 */
function InchField({
  label,
  id,
  value,
  onChange,
  maxWhole,
  signed = false
}: {
  label: string;
  id: string;
  value: number;
  onChange: (value: number) => void;
  maxWhole: number;
  signed?: boolean;
}) {
  const parts = splitInches(value);
  const emit = (next: Partial<InchParts>) => onChange(joinInches({ ...parts, ...next }));

  return (
    <div>
      <span className={FIELD_MICRO_LABEL} id={`${id}-label`}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {signed && (
          <div className="w-[7.5rem] shrink-0">
            <SegmentedControl
              label={`${label} direction`}
              value={parts.negative ? "down" : "up"}
              onChange={(d) => emit({ negative: d === "down" })}
              options={[
                { value: "up", label: "Up" },
                { value: "down", label: "Down" }
              ]}
            />
          </div>
        )}
        {/* Each control is sized by its wrapper rather than by a width class
            on the control itself. `FIELD_DENSE` carries `w-full`, and Tailwind
            resolves competing utilities by stylesheet order rather than
            attribute order, so a `w-14` appended to it loses and the row
            overflows the card. Same trap as the colour rule in
            docs/DESIGN-LANGUAGE.md section 2. */}
        <div className="w-14 shrink-0">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            aria-labelledby={`${id}-label`}
            className={`${FIELD_DENSE} text-center tabular-nums`}
            value={String(parts.whole)}
            onChange={(e) => {
              // Digits only. A stripped field reads as 0 rather than NaN, so
              // clearing it to type a new number never blanks the drawing.
              const digits = e.target.value.replace(/\D/g, "");
              emit({ whole: Math.min(Number(digits || 0), maxWhole) });
            }}
          />
        </div>
        <div className="w-[5.5rem] shrink-0">
          <select
            aria-label={`${label} fraction`}
            className={FIELD_DENSE_SELECT}
            value={parts.eighths}
            onChange={(e) => emit({ eighths: Number(e.target.value) })}
          >
            {EIGHTHS.map((fraction, eighths) => (
              <option key={eighths} value={eighths}>
                {fraction}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-ink-secondary">in</span>
      </div>
    </div>
  );
}

/**
 * A labelled range with its number beside it.
 *
 * A native range input rather than a hand-rolled drag: it is the one control
 * the platform already makes accessible, keyboard-operable and correctly sized
 * for a thumb, and the app has no slider primitive to reach for. If a second
 * screen wants one, this graduates to `components/ui/`.
 */
function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  warn = false,
  band,
  bandMin,
  bandMax
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: "deg" | "in";
  onChange: (value: number) => void;
  warn?: boolean;
  /** A span of the track to shade as unusable, in the value's own units. */
  band?: readonly [number, number];
  bandMin?: number;
  bandMax?: number;
}) {
  const shown = unit === "deg" ? `${Math.round(value)}°` : `${formatInches(value)}"`;
  const id = `slider-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const [hintOpen, setHintOpen] = useState(false);

  const bandStyle =
    band && bandMin != null && bandMax != null
      ? {
          left: `${((band[0] - bandMin) / (bandMax - bandMin)) * 100}%`,
          width: `${((band[1] - band[0]) / (bandMax - bandMin)) * 100}%`
        }
      : null;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {/* The label is the affordance. Tapping the name of a thing to find out
            what it means is the gesture people already try, and a separate icon
            would be a second tap target in a row that is already dense, so the
            whole label is the button and the glyph only says that it is one. */}
        <button
          type="button"
          onClick={() => setHintOpen((v) => !v)}
          aria-expanded={hintOpen}
          aria-controls={`${id}-hint`}
          className={`${FIELD_MICRO_LABEL} mb-0 inline-flex items-center gap-1 text-left`}
        >
          {label}
          <Info size={11} aria-hidden="true" className="opacity-60" />
        </button>
        <span className={`text-sm font-bold tabular-nums ${warn ? "text-warning-700" : "text-ink"}`}>
          {shown}
        </span>
      </div>
      <div className="relative">
        {/* The do-not-use band, drawn on the track itself. A number a bowler
            should not pick is better shown where they are picking it than
            explained underneath after they have picked it. */}
        {bandStyle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-warning-200"
            style={bandStyle}
          />
        )}
        <input
          id={id}
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative h-11 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-accent-fill [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-edge-strong [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-edge-strong [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-accent-fill [&::-webkit-slider-thumb]:shadow"
        />
      </div>
      {/* Hidden until asked for. Three of these stacked is a paragraph of
          explanation standing between the bowler and the control they came to
          move. */}
      <p
        id={`${id}-hint`}
        hidden={!hintOpen}
        className="mt-0.5 text-xs leading-snug text-ink-secondary"
      >
        {hint}
      </p>
    </div>
  );
}

/** One motion axis as a bar between its two named ends. */
function Axis({
  label,
  value,
  low,
  high,
  note
}: {
  label: string;
  value: number;
  low: string;
  high: string;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-strong">{label}</span>
        {note && <span className="tabular-nums text-ink-secondary">{note}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent-fill"
          style={{ width: `${clamp(value, 0, 1) * 100}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-tertiary">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/** A named number, in the notation a drill sheet uses. */
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
      <span className={FIELD_MICRO_LABEL}>{label}</span>
      <span className="block text-sm font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}
