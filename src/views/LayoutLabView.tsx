import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Info,
  LayoutGrid,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { BallLayoutDiagram } from "../components/BallLayoutDiagram";
import { PapEditor } from "../components/PapEditor";
import { ShareCardDialog } from "../components/ShareCardDialog";
import { PushScreen } from "../components/PushScreen";
import { AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { ShareIosIcon } from "../components/icons";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { FIELD_MICRO_LABEL } from "../components/ui/field";
import { GROUP_HEADING } from "../components/ui/typography";
import {
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  DO_NOT_USE_BAND,
  LAYOUT_PRESETS,
  clamp,
  formatDualAngle,
  formatInches,
  formatVls,
  fromVls,
  inDoNotUseBand,
  presetLayout,
  readMotion,
  toVls,
  type BallSpec,
  type DualAngleLayout,
  type LayoutPreset,
  type PapMeasurement
} from "../lib/ballLayout";
import { defaultOrientationFor, type Orientation } from "../lib/ballProjection";
import { decodeLayoutParams, layoutShareUrl } from "../lib/layoutShare";
import { buildLayoutCard, type ShareCardData } from "../lib/shareCard";
import { svgToImage } from "../lib/svgImage";
import {
  getGripStyle,
  getHandedness,
  getPap,
  setGripStyle as saveGripStyle,
  setPap as savePap
} from "../services/bowlingRepository";
import { useHandedness } from "../lib/handednessContext";
import type { GripStyle, Handedness } from "../types/bowling";

interface LayoutLabViewProps {
  onBack: () => void;
  /** Open Settings at the preferences section, where the hand, the grip and
   *  the PAP this screen opens with are kept. Optional, so the screen still
   *  renders in a test that only cares about the layout. */
  onOpenSettings?: () => void;
}

/** Where a menu hangs from, in viewport coordinates. */
interface Anchor {
  left: number;
  top: number;
}

/** Anchor a menu of `width` px under the control that opened it, clamped so it
 *  cannot run off a narrow screen. */
function anchorUnder(el: Element, width: number): Anchor {
  const r = el.getBoundingClientRect();
  return { left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), top: r.bottom + 6 };
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
 * The screen is arranged in the order the question gets asked: who is bowling,
 * what ball, what numbers, what does it look like, what will it do. The diagram
 * sits directly under the sliders rather than at the top, because the sliders
 * are what the thumb is on and a picture above them would be the thing scrolled
 * off screen.
 */
export function LayoutLabView({ onBack, onOpenSettings }: LayoutLabViewProps) {
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
  const [menuAt, setMenuAt] = useState<Anchor | null>(null);
  const [presetAt, setPresetAt] = useState<Anchor | null>(null);
  const [pendingPreset, setPendingPreset] = useState<LayoutPreset | null>(null);
  const [resetting, setResetting] = useState(false);
  const [card, setCard] = useState<ShareCardData | null>(null);
  // The diagram's own SVG, read off the DOM when a picture is asked for.
  // BallLayoutDiagram is a plain function component and forwards no ref, and
  // a second hidden copy of the ball would be the same geometry drawn twice.
  const ballRef = useRef<HTMLDivElement>(null);

  // The bowler's own numbers come from their settings, so nobody re-types their
  // axis, their hand or their grip on every visit. A shared link overrides all
  // three: someone else's layout is only a layout when it is read against the
  // bowler it was drilled for.
  const appHand = useHandedness();
  const storedPap = useLiveQuery(getPap, [], undefined);
  const storedHand = useLiveQuery(getHandedness, [], undefined);
  const storedGrip = useLiveQuery(getGripStyle, [], undefined);

  const [papOverride, setPapOverride] = useState<PapMeasurement | null>(shared?.pap ?? null);
  const [handOverride, setHandOverride] = useState<Handedness | null>(shared?.hand ?? null);
  const [gripOverride, setGripOverride] = useState<GripStyle | null>(shared?.grip ?? null);

  const pap = papOverride ?? storedPap ?? DEFAULT_PAP;
  const hand: Handedness = handOverride ?? storedHand ?? appHand;
  // One-handed until told otherwise: it is far and away the common grip, and a
  // toggle sitting on neither answer is a question nobody asked.
  const grip: GripStyle = gripOverride ?? storedGrip ?? "1h";
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

  // Editing the PAP or the grip writes it back, because both are the bowler's
  // own and not this screen's scratch values: the whole point of storing them
  // is that the next visit, and every other screen that ever wants them,
  // already knows. Anything that arrived in a shared link is somebody else's
  // and is never saved.
  const fromLink = shared != null;
  const updatePap = useCallback(
    (next: PapMeasurement) => {
      setPapOverride(next);
      if (!fromLink) void savePap(next);
    },
    [fromLink]
  );

  const chooseGrip = useCallback(
    (next: GripStyle) => {
      setGripOverride(next);
      if (!fromLink) void saveGripStyle(next);
    },
    [fromLink]
  );

  const motion = useMemo(() => readMotion(layout, ball, pap), [layout, ball, pap]);
  const vls = useMemo(() => toVls(layout, ball), [layout, ball]);

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

  /** The card this layout makes, numbers first and the ball a frame later. */
  const buildCard = useCallback(() => {
    return buildLayoutCard({
      dualAngle: formatDualAngle(layout),
      vls: formatVls(vls),
      symmetric: ball.symmetric,
      hand,
      grip,
      pap: `${formatInches(pap.over)}" over, ${formatInches(Math.abs(pap.up))}" ${pap.up < 0 ? "down" : "up"}`,
      summary: motion.summary
    });
  }, [layout, vls, ball, hand, grip, pap, motion]);

  /** The ball as it is drawn right now, rasterized for the card. */
  const rasterizeBall = useCallback(async () => {
    const svg = ballRef.current?.querySelector("svg");
    if (!svg) return undefined;
    try {
      return await svgToImage(svg as SVGSVGElement, 560);
    } catch {
      return undefined;
    }
  }, []);

  /**
   * Share the layout, as a link with the card as its preview.
   *
   * The link rather than the picture, because a layout is a thing to open. The
   * three numbers are only half of it: a reader who gets the link can turn the
   * ball, move the sliders, and send a different layout back, and a PNG can do
   * none of that. The card is still drawn and still shown, because a link
   * pasted into a chat is a line of text nobody can see, and the preview is
   * what says what is about to be sent. Saving the picture to the camera roll
   * is a control on that preview, which is where the picture exists.
   */
  const shareLink = useCallback(async () => {
    setMenuAt(null);
    // The dialog opens on the numbers straight away and the ball lands in it a
    // frame later, rather than the control sitting dead while an image decodes.
    setCard(buildCard());
    const diagram = await rasterizeBall();
    if (diagram) setCard((current) => (current ? { ...current, diagram } : current));
  }, [buildCard, rasterizeBall]);

  const shareUrl = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : layoutShareUrl(
            { layout, ball, pap, hand, grip },
            window.location.origin,
            window.location.pathname
          ),
    [layout, ball, pap, hand, grip]
  );

  const applyPreset = useCallback(
    (preset: LayoutPreset) => {
      setLayout(presetLayout(preset, ball));
      setPendingPreset(null);
      setPresetAt(null);
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
        setPresetAt(null);
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
      active={
        pendingPreset == null && !resetting && menuAt == null && presetAt == null && card == null
      }
      /* Two trailing actions, which is the one place the app departs from the
         single trailing action in docs/DESIGN-LANGUAGE.md section 1. Sharing a
         layout is the thing this screen is for once the numbers are right, and
         a share buried one tap inside More reads as an afterthought. Saving the
         picture used to be a third glyph here and is not: it is a thing to do
         to the card, not to the screen, so it lives on the card. Everything
         that is genuinely rare still lives behind the glyph. */
      trailing={
        <>
          <IconButton variant="round" label="Share layout" onClick={() => void shareLink()}>
            <ShareIosIcon size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            variant="round"
            label="More"
            className="ml-1"
            // Anchored off the event's own target rather than a ref, because
            // IconButton is a plain function component and does not forward one.
            onClick={(e) => setMenuAt(anchorUnder(e.currentTarget, 176))}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </IconButton>
        </>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-3 px-3 py-3 sm:px-6">
        {/* 1. Who is bowling. The PAP leads because it is the frame every other
            number is measured against: the VAL angle is measured at it and the
            pin-to-PAP distance is measured to it, so a layout read against the
            wrong axis is the wrong layout. It used to sit last on the grounds
            that it is set once and then left alone, which is true of how often
            it is touched and wrong about what it means.

            The hand and the grip ride beside it rather than under it. They are
            two two-way answers, so they cost a quarter of the width and would
            otherwise cost two full bands of a phone screen. */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className={GROUP_HEADING}>You</h2>
            {/* Back to the bowler's own saved numbers, in one tap. The PAP, the
                hand and the grip are what a shared link overrides, so the way
                out of somebody else's measurements sits with them. */}
            <IconButton
              compact
              label="Reset to your saved settings"
              title="Reset to your saved settings"
              onClick={() => setResetting(true)}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </IconButton>
          </div>
          {/* Stretched rather than top-aligned, so the two cards end level
              whichever is taller. The hand card is the taller of the two (two
              toggles against two rows of fields), so the PAP card takes a few
              px of extra padding at the bottom, which reads as padding. */}
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 space-y-1.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
              <span className={FIELD_MICRO_LABEL}>Your PAP</span>
              <PapEditor pap={pap} onChange={updatePap} idPrefix="lab-pap" />
            </div>
            <div className="w-[7.5rem] shrink-0 space-y-1.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
              <span className={FIELD_MICRO_LABEL}>Hand</span>
              {/* `space-y-2` is required, not chosen: a dense segmented control
                  is 36px drawn and 44pt to the finger, so two stacked any
                  closer than 8px would have overlapping hit regions and the
                  grip row would start swallowing taps meant for the hand. */}
              <div className="space-y-2">
                {/* Left on the left, which is the one ordering that needs no
                    reading: the letters sit where the hands do. */}
                <SegmentedControl
                  dense
                  label="Bowling hand"
                  value={hand}
                  onChange={chooseHand}
                  options={[
                    { value: "left", label: "L", srLabel: "Left" },
                    { value: "right", label: "R", srLabel: "Right" }
                  ]}
                />
                {/* One-handed or two-handed. It is stored and it is shared, and
                    it changes nothing about the arithmetic yet: a two-handed
                    layout is genuinely different geometry and guessing at it
                    here would be worse than saying nothing. */}
                <SegmentedControl
                  dense
                  label="Grip style"
                  value={grip}
                  onChange={chooseGrip}
                  options={[
                    { value: "1h", label: "1H", srLabel: "One handed" },
                    { value: "2h", label: "2H", srLabel: "Two handed" }
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 2. What ball. The core type comes before the numbers because it
            changes what the drilling angle means, and therefore what every
            number below does. */}
        <section className="space-y-1.5">
          <h2 className={GROUP_HEADING}>Core</h2>
          <SegmentedControl
            label="Core type"
            value={symmetric ? "sym" : "asym"}
            onChange={(v) => setSymmetric(v === "sym")}
            options={[
              { value: "asym", label: "Asym", srLabel: "Asymmetric" },
              { value: "sym", label: "Sym", srLabel: "Symmetric" }
            ]}
          />
        </section>

        {/* 3. The numbers. */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className={GROUP_HEADING}>Layout</h2>
            {/* The presets, as a named menu on the heading row. This replaced a
                Reset control and a separate labelled dropdown underneath it,
                which between them spent two bands of a phone screen on one
                idea: every reset this screen had was "go back to the
                benchmark", and the benchmark is a preset. One control now, and
                it says which preset is on screen in its own spoken name rather
                than in a field that has to be looked at. */}
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={presetAt != null}
              aria-label={`Presets, ${activePreset?.name ?? "Custom"}`}
              onClick={(e) => setPresetAt(anchorUnder(e.currentTarget, 176))}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent active:opacity-80"
            >
              <LayoutGrid size={13} aria-hidden="true" />
              Presets
            </button>
          </div>

          {/* Both notations, always, and the one being edited is the one
              selected. These used to be two read-only boxes under a segmented
              control that said the same two words: the toggle's whole argument
              is that the two notations are one layout, so the boxes showing
              that layout in both are exactly the right thing to tap. One row
              instead of two, and nothing is hidden to get it. */}
          <div className="grid grid-cols-2 gap-2">
            <SystemCard
              label="Dual angle"
              value={formatDualAngle(layout)}
              selected={system === "dual"}
              onClick={() => setSystem("dual")}
            />
            <SystemCard
              label="Storm VLS"
              value={formatVls(vls)}
              selected={system === "vls"}
              onClick={() => setSystem("vls")}
            />
          </div>

          {system === "dual" ? (
            <div className="space-y-0.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
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
            <div className="space-y-0.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
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
                  No moulded PSA on a symmetric ball, so VLS is two numbers here. The pro shop names
                  one in the thumb hole, which is where the ball shows it.
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
        </section>

        {/* 4. The ball. The row of chips that used to sit under it (jump to the
            grip, the pin, the PAP, the core, and a flare rings toggle) is gone:
            the ball is draggable, which is the gesture everyone tries first,
            and the chips were a second way to do the same thing taking a band
            of a screen whose whole complaint was that too little fits on it. */}
        <section className="space-y-1.5">
          <h2 className={GROUP_HEADING}>On the ball</h2>
          <div
            ref={ballRef}
            className="overflow-hidden rounded-xl border border-edge bg-surface-sunken shadow-sm"
          >
            {/* The drawing follows the notation being edited, so the picture is
                always answering the question the sliders above it are asking. */}
            <BallLayoutDiagram
              layout={layout}
              ball={ball}
              pap={pap}
              system={system}
              orientation={orientation}
              onOrientationChange={setOrientation}
              hand={hand}
            />
          </div>
        </section>

        {/* 5. What it will do. */}
        <section className="space-y-1.5">
          <h2 className={GROUP_HEADING}>What it will do</h2>
          <div className="space-y-2 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
            <p className="text-sm text-ink">{motion.summary}</p>
            <Axis label="Flare" value={motion.flare} low="Low" high="High" note={`${motion.flareInches.toFixed(1)}"`} />
            <Axis label="Reads the lane" value={motion.length} low="Early" high="Late" />
            <Axis label="Off the friction" value={motion.angularity} low="Smooth" high="Sharp" />
            <Axis label="Overall strength" value={motion.strength} low="Weak" high="Strong" />
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
          {/* The hand, the grip and the PAP are settings, not this screen's
              numbers, so the way to their permanent home is here rather than a
              second control beside the fields that edit them. */}
          <AnchoredMenuItem
            icon={SlidersHorizontal}
            onClick={() => {
              setMenuAt(null);
              onOpenSettings?.();
            }}
          >
            Settings
          </AnchoredMenuItem>
        </AnchoredMenu>
      )}

      {presetAt && (
        <AnchoredMenu left={presetAt.left} top={presetAt.top} onClose={() => setPresetAt(null)}>
          {LAYOUT_PRESETS.map((preset) => (
            <AnchoredMenuItem
              key={preset.id}
              icon={activePreset?.id === preset.id ? Check : LayoutGrid}
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
            {pendingPreset ? formatDualAngle(presetLayout(pendingPreset, ball)) : ""}. Your PAP,
            hand and grip stay as they are.
          </>
        }
        confirmLabel="Replace"
        onConfirm={() => pendingPreset && applyPreset(pendingPreset)}
        onCancel={() => setPendingPreset(null)}
      />

      {/* The reset asks first, and names what it is resetting *to*. It is not
          a reset to the app's defaults, it is a reset to the bowler's own saved
          hand, grip and PAP, and those two are only the same thing until the
          bowler has measured anything. Someone reading a shared layout is
          exactly who reaches for this, and they should know it is about to swap
          the sender's axis for their own rather than blank both. */}
      <ConfirmDialog
        open={resetting}
        title="Use your saved settings?"
        message="This puts the hand, grip and PAP from your preferences back on this screen. The layout numbers stay as they are."
        confirmLabel="Use mine"
        onConfirm={() => {
          setPapOverride(null);
          setHandOverride(null);
          setGripOverride(null);
          setTurnedTo(null);
          setResetting(false);
        }}
        onCancel={() => setResetting(false)}
      />

      <ShareCardDialog
        open={card != null}
        card={card}
        link={{ url: shareUrl, title: `Layout ${formatDualAngle(layout)}` }}
        onClose={() => setCard(null)}
      />
    </PushScreen>
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
  const hintRef = useRef<HTMLDivElement>(null);

  // A tap anywhere else puts the bubble away, which is what makes it a popup
  // rather than a panel: it is read once and dismissed, and it never has to be
  // closed from the same small target that opened it. `pointerdown` rather
  // than `click`, so the tap that dismisses it does not also work the control
  // underneath it by accident.
  useEffect(() => {
    if (!hintOpen) return;
    const away = (e: PointerEvent) => {
      if (!hintRef.current?.contains(e.target as Node)) setHintOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [hintOpen]);

  const bandStyle =
    band && bandMin != null && bandMax != null
      ? {
          left: `${((band[0] - bandMin) / (bandMax - bandMin)) * 100}%`,
          width: `${((band[1] - band[0]) / (bandMax - bandMin)) * 100}%`
        }
      : null;

  return (
    <div className="relative" ref={hintRef}>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
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
      {/* A popup over the row rather than a line added under it. Three of these
          stacked is a paragraph standing between the bowler and the control
          they came to move, and opening one used to push the two sliders below
          it down the screen under the thumb that was already reaching for
          them. Floating it changes nothing about where anything sits. */}
      {hintOpen && (
        <div
          id={`${id}-hint`}
          role="dialog"
          aria-label={`${label}, what it does`}
          className="absolute left-0 right-0 top-6 z-20 flex items-start gap-2 rounded-lg border border-edge bg-surface p-2 text-xs leading-snug text-ink-secondary shadow-lg"
        >
          <p className="min-w-0 flex-1">{hint}</p>
          <IconButton compact label="Close" onClick={() => setHintOpen(false)}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      )}
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

/**
 * One notation, as a button: its name, the layout written in it, and whether it
 * is the one the sliders are editing.
 *
 * It replaced a read-only box of the same shape sitting under a segmented
 * control that carried the same two words. The control and the boxes were
 * saying one thing twice, and the boxes were the half worth keeping: the whole
 * argument for having a toggle at all is that the two notations are one layout,
 * and the box that shows the layout in a notation is exactly the thing to tap
 * to start editing it in that notation.
 */
function SystemCard({
  label,
  value,
  selected,
  onClick
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl border p-2.5 text-center shadow-sm active:opacity-80 ${
        selected ? "border-accent-fill bg-accent-soft" : "border-edge bg-surface"
      }`}
    >
      <span className={FIELD_MICRO_LABEL}>{label}</span>
      <span
        className={`block text-sm font-bold tabular-nums ${selected ? "text-accent" : "text-ink"}`}
      >
        <LayoutNumbers value={value} />
      </span>
    </button>
  );
}

/**
 * A layout reading with its separators stepped back, so the numbers carry it.
 *
 * `45 x 4 1/2 x 45` is three measurements and two pieces of punctuation, and at
 * one weight the punctuation reads as loudly as the numbers: the eye lands on
 * the x's because they are the only repeated shape in the line. Dimming them
 * costs nothing and puts the emphasis where the meaning is.
 *
 * Split rather than formatted this way at the source, because the separator is
 * a presentation choice and `formatDualAngle` and `formatVls` have three other
 * callers (the share card, the share title, a screen reader) that all want one
 * plain string. The split is safe on the space-padded `x`: a fraction inside a
 * measurement is `4 1/2`, which has a space but never a lone x around it.
 *
 * The spaces around the separator are real text rather than padding on the
 * span. Padding would look identical and read as `45x4 1/2x45`, because the
 * accessible name of the button around this is its text content with the
 * styling thrown away: a screen reader would get one run-on number where a
 * sighted reader gets three measurements.
 */
function LayoutNumbers({ value }: { value: string }) {
  const parts = value.split(" x ");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="font-normal text-ink-tertiary">{" x "}</span>}
          {part}
        </span>
      ))}
    </>
  );
}
