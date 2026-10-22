import { useCallback, useMemo, useRef, useState } from "react";
import { Check, LayoutGrid, MoreHorizontal, RotateCcw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { flushSync } from "react-dom";
import { BallLayoutDiagram } from "../components/BallLayoutDiagram";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { BowlingBallIcon } from "../components/icons";
import { LayoutEditor } from "../components/LayoutEditor";
import { PapEditor } from "../components/PapEditor";
import { ShareCardDialog } from "../components/ShareCardDialog";
import { PushScreen } from "../components/PushScreen";
import { ANCHORED_MENU_WIDTH, AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { Button } from "../components/ui/Button";
import { FormSheet } from "../components/ui/FormSheet";
import { ShareIosIcon } from "../components/icons";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { FIELD_MICRO_LABEL } from "../components/ui/field";
import { GROUP_HEADING } from "../components/ui/typography";
import {
  DEFAULT_ASYMMETRIC,
  DEFAULT_PAP,
  DEFAULT_SYMMETRIC,
  LAYOUT_PRESETS,
  clamp,
  formatDualAngle,
  formatInches,
  formatVls,
  presetLayout,
  readMotion,
  toVls,
  type BallSpec,
  type DualAngleLayout,
  type LayoutPreset,
  type PapMeasurement
} from "../lib/ballLayout";
import { defaultOrientationFor, type Orientation } from "../lib/ballProjection";
import { FREE_APP_PATH } from "../lib/pro";
import { shareOrigin } from "../lib/platform";
import { useProAccess } from "../lib/useProAccess";
import { decodeLayoutParams, layoutShareUrl, type LayoutSeed } from "../lib/layoutShare";
import { buildLayoutCard, type ShareCardData } from "../lib/shareCard";
import { svgToImage } from "../lib/svgImage";
import {
  getGripStyle,
  getHandedness,
  getLayoutSystem,
  getPap
} from "../services/bowlingRepository";
import { useHandedness } from "../lib/handednessContext";
import type { GripStyle, Handedness, LayoutSystem } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";

interface LayoutLabViewProps {
  onBack: () => void;
  /** A layout to open on, handed in by whatever sent us here: a ball in the
   *  arsenal whose drilling is being looked at. It outranks the query string
   *  the same way a shared link outranks the defaults, because it is the more
   *  specific answer to "which layout is this screen about". */
  seed?: LayoutSeed;
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

/** The page's query string, guarded for a render with no window behind it. */
function currentSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

/** The ball a seeded lab is showing: its picture, name, weight, core and
 *  numbers, as the arsenal holds them. */
function SeededBallCard({ seed }: { seed: LayoutSeed }) {
  const snap = seed.ballSnapshot;
  const title = [seed.ballName, seed.ballWeight ? `${seed.ballWeight} lb` : null]
    .filter(Boolean)
    .join(" · ");
  const core = snap
    ? [snap.coreName, seed.ball.symmetric ? "Symmetric" : "Asymmetric"].filter(Boolean).join(" · ")
    : seed.ball.symmetric
      ? "Symmetric"
      : "Asymmetric";
  const specs = snap
    ? [
        snap.coverstockCategory,
        snap.rg !== null ? `RG ${snap.rg.toFixed(2)}` : null,
        snap.diff !== null ? `Diff ${snap.diff.toFixed(3)}` : null,
        snap.mbDiff !== null ? `MB ${snap.mbDiff.toFixed(3)}` : null
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
      <div className="h-14 w-14 shrink-0">
        {snap ? (
          <CatalogBallImage
            src={snap.imageThumb}
            alt={seed.ballName ?? ""}
            brand={snap.brand as Manufacturer}
            size="thumb"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface-muted text-ink-tertiary">
            <BowlingBallIcon size={24} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-secondary">{core}</p>
        {specs && <p className="truncate text-xs tabular-nums text-ink-secondary">{specs}</p>}
      </div>
    </div>
  );
}

const BENCHMARK: DualAngleLayout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

/**
 * The layout lab: three numbers, a ball you can turn, and what the ball will do.
 *
 * It holds nothing and saves nothing, which is deliberate. This is the ball
 * equivalent of the line sandbox: a place to find out what a layout does before
 * committing to one, not a record of a layout you own. A ball's actual layout
 * is a field on the ball in the arsenal, and the bowler's own axis, hand and
 * grip are settings: this screen opens on them and never writes to them.
 *
 * The ball leads, with what it will do right under it (ADR-163), and the
 * controls follow in the order the question gets asked: who is bowling, what
 * ball, what numbers. It used to put the diagram directly under the sliders so
 * it would stay on screen while they moved; the ball is what the screen is for,
 * so it is the first thing seen, and the sliders come after it.
 */
export function LayoutLabView({ onBack, seed }: LayoutLabViewProps) {
  // Without Pro the three numbers are read-only (ADR-170): the layout, shared or
  // a ball's own, is drawn in full with what it will do, and the bowler can
  // turn it, set their own PAP, hand and grip, the core and the notation, and
  // share it. Only the sliders and the presets that move them are Pro.
  const { locked: proLocked } = useProAccess();
  // A link shared into the app wins over everything, and it is read once at
  // module level of this render rather than in an effect: it is available
  // synchronously, so seeding state from it needs no second render and no
  // flash of the defaults before the shared layout arrives.
  const shared = useMemo(() => seed ?? decodeLayoutParams(currentSearch()), [seed]);

  const [symmetric, setSymmetric] = useState(shared ? shared.ball.symmetric : false);
  const [layout, setLayout] = useState<DualAngleLayout>(shared?.layout ?? BENCHMARK);
  // Null means "whichever notation the bowler reads layouts in", so the stored
  // preference can arrive a tick later without an effect reaching back into
  // state. A seeded ball that names its own notation wins over both: it is the
  // notation that ball's layout was written down in.
  const [systemOverride, setSystemOverride] = useState<LayoutSystem | null>(seed?.system ?? null);
  // Null means "wherever this hand's layout opens", so the camera can follow a
  // handedness that arrives asynchronously from settings without an effect
  // reaching back into state after the fact.
  const [turnedTo, setTurnedTo] = useState<Orientation | null>(null);
  const [presetAt, setPresetAt] = useState<Anchor | null>(null);
  const [pendingPreset, setPendingPreset] = useState<LayoutPreset | null>(null);
  // The sheet behind More: the PAP, the hand and the grip.
  const [youOpen, setYouOpen] = useState(false);
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
  const storedSystem = useLiveQuery(getLayoutSystem, [], undefined);

  const [papOverride, setPapOverride] = useState<PapMeasurement | null>(shared?.pap ?? null);
  const [handOverride, setHandOverride] = useState<Handedness | null>(shared?.hand ?? null);
  const [gripOverride, setGripOverride] = useState<GripStyle | null>(shared?.grip ?? null);

  const pap = papOverride ?? storedPap ?? DEFAULT_PAP;
  const hand: Handedness = handOverride ?? storedHand ?? appHand;
  // One-handed until told otherwise: it is far and away the common grip, and a
  // toggle sitting on neither answer is a question nobody asked.
  const grip: GripStyle = gripOverride ?? storedGrip ?? "1h";
  const system: LayoutSystem = systemOverride ?? storedSystem ?? "dual";
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

  /*
   * Nothing on this screen is written back. Not the PAP, not the grip, not the
   * hand.
   *
   * The lab seeds from the bowler's saved settings so nobody re-types their own
   * axis on every visit, and that is where the connection ends: turning the
   * PAP up an eighth here to see what it does to a layout is a question being
   * asked, not a measurement being taken. Saving it made the sandbox edit the
   * bowler, and it did so silently, from a control that gives no hint it is
   * touching anything outside the screen. Worse, it is a sandbox people are
   * meant to poke at, so the damage was likeliest for exactly the person using
   * it as intended, and a PAP is measured off a thrown shot in a pro shop, not
   * recoverable by undoing a dropdown.
   *
   * So the writes live where the measurements do, in Settings, Preferences.
   * This screen reads them, and the reset beside them puts the saved ones back
   * when the sliders have wandered (or when a shared link brought someone
   * else's along). It is the module's own opening claim, finally true: it
   * holds nothing and saves nothing.
   */
  const updatePap = useCallback((next: PapMeasurement) => setPapOverride(next), []);
  const chooseGrip = useCallback((next: GripStyle) => setGripOverride(next), []);

  const motion = useMemo(() => readMotion(layout, ball, pap), [layout, ball, pap]);
  const vls = useMemo(() => toVls(layout, ball), [layout, ball]);
  const papText = `${formatInches(pap.over)}" over, ${formatInches(Math.abs(pap.up))}" ${pap.up < 0 ? "down" : "up"}`;

  /** The card this layout makes, numbers first and the ball a frame later. */
  const buildCard = useCallback(() => {
    return buildLayoutCard({
      dualAngle: formatDualAngle(layout),
      vls: formatVls(vls),
      symmetric: ball.symmetric,
      hand,
      grip,
      pap: papText,
      summary: motion.summary
    });
  }, [layout, vls, ball, hand, grip, papText, motion]);

  /** The ball as it is drawn right now, rasterized for the card. */
  /**
   * The ball for the card, always as it first opens: facing forward, the grip
   * and the PAP either side of centre. The card is a picture of the layout, not
   * of wherever the bowler last dragged the ball to, and a ball spun round to
   * the side or tipped over reads as a mistake on a card nobody can turn.
   *
   * So the camera goes home for the length of one synchronous read and comes
   * back: `flushSync` draws the forward view, `svgToImage` serializes it before
   * it returns, and the bowler's own angle is restored before the browser has
   * painted either, so the screen behind the card never moves.
   */
  const rasterizeBall = useCallback(async () => {
    flushSync(() => setTurnedTo(null));
    const svg = ballRef.current?.querySelector("svg");
    let picture: Promise<HTMLImageElement> | undefined;
    if (svg) picture = svgToImage(svg as SVGSVGElement, 560);
    flushSync(() => setTurnedTo(turnedTo));
    if (!picture) return undefined;
    try {
      return await picture;
    } catch {
      return undefined;
    }
  }, [turnedTo]);

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
            shareOrigin(),
            // Always the web app: a link from the store app opens there for
            // whoever it is sent to, or in their app (ADR-159).
            FREE_APP_PATH
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
      title="Layouts"
      onBack={onBack}
      /* Escape belongs to whatever is layered on top. Without this the menu's
         own Escape and the screen's both fired, so dismissing the menu also
         popped the screen out from under it. */
      active={
        pendingPreset == null && presetAt == null && card == null && !youOpen
      }
      /* Two trailing actions, the one place the app has two (DESIGN-LANGUAGE
         section 1). Sharing the layout is what this screen is for once the
         numbers are right. More holds who is bowling, the PAP, the hand and
         the grip: set once and then read against, so they do not take the
         page from the ball and the sliders. Saving the picture is a thing to
         do to the card, so it lives on the card. */
      trailing={
        <>
          <IconButton variant="round" label="Share layout" onClick={() => void shareLink()}>
            <ShareIosIcon size={18} aria-hidden="true" />
          </IconButton>
          <IconButton variant="round" label="More" className="ml-1" onClick={() => setYouOpen(true)}>
            <MoreHorizontal size={20} aria-hidden="true" />
          </IconButton>
        </>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-3 px-3 py-3 sm:px-6">
        {/* Whose layout is on screen, when it arrived from a ball rather than
            from the sliders: the ball itself, with what the arsenal knows of
            it, so the numbers below are read against the ball they belong to. */}
        {seed?.ballName && <SeededBallCard seed={seed} />}

        {/* 1. The ball, and what it will do, side by side (ADR-203). The ball
            needs no more than half the width to read, and the bars beside it
            answer every change to the numbers below without a scroll back up.
            It was the full width, pinned under the bar, with "What it will do"
            in its own section under it: the pinned ball took a third of the
            screen from everything that scrolled. Now the page is one scroll,
            short enough to need little of it. The ball is draggable, which is
            the gesture everyone tries first. */}
        <div className="grid grid-cols-2 items-stretch gap-2.5">
          <div
            ref={ballRef}
            className="min-h-[13.5rem] overflow-hidden rounded-xl border border-edge bg-surface-sunken shadow-sm"
          >
            {/* The drawing follows the notation being edited, so the picture is
                always answering the question the sliders below it are asking. */}
            <BallLayoutDiagram
              layout={layout}
              ball={ball}
              pap={pap}
              system={system}
              orientation={orientation}
              onOrientationChange={setOrientation}
              hand={hand}
              grip={grip}
              className="h-full"
            />
          </div>
          {/* The bars, then the sentence they add up to. No heading: the bars
              name themselves, and the ball beside them says whose they are. */}
          <section aria-label="What it will do" className="space-y-2 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
            <Axis label="Flare" value={motion.flare} low="Low" high="High" note={`${motion.flareInches.toFixed(1)}"`} />
            <Axis label="Reads the lane" value={motion.length} low="Early" high="Late" />
            <Axis label="Off the friction" value={motion.angularity} low="Smooth" high="Sharp" />
            <Axis label="Overall strength" value={motion.strength} low="Weak" high="Strong" />
            <p className="text-xs leading-snug text-ink-secondary">{motion.summary}</p>
          </section>
        </div>

        {motion.warnings.map((warning) => (
          <p
            key={warning}
            className="rounded-lg border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-700"
          >
            {warning}
          </p>
        ))}

        {/* 3. What ball. The core type comes before the numbers because it
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

        {/* 4. The numbers. */}
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
            {!proLocked && (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={presetAt != null}
                aria-label={`Presets, ${activePreset?.name ?? "Custom"}`}
                onClick={(e) => setPresetAt(anchorUnder(e.currentTarget, ANCHORED_MENU_WIDTH))}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent active:opacity-80"
              >
                <LayoutGrid size={13} aria-hidden="true" />
                Presets
              </button>
            )}
          </div>

          <LayoutEditor
            layout={layout}
            onChange={setLayout}
            ball={ball}
            system={system}
            onSystemChange={setSystemOverride}
            idPrefix="lab"
            proNumbers
          />
        </section>
      </div>

      {presetAt && (
        <AnchoredMenu left={presetAt.left} top={presetAt.top} align="end" onClose={() => setPresetAt(null)}>
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

      {youOpen && (
        <FormSheet title="Your PAP and hand" onClose={() => setYouOpen(false)} dismissAs="done">
          {/* 2. Who is bowling. The PAP leads because it is the frame every other
              number is measured against: the VAL angle is measured at it and the
              pin-to-PAP distance is measured to it, so a layout read against the
              wrong axis is the wrong layout. It used to sit last on the grounds
              that it is set once and then left alone, which is true of how often
              it is touched and wrong about what it means.

              The hand and the grip ride beside it rather than under it. They are
              two two-way answers, so they cost a quarter of the width and would
              otherwise cost two full bands of a phone screen. */}
          <section className="space-y-3">
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
                  {/* One-handed or two-handed. It draws the ball the bowler
                      actually holds (no thumb hole, and the grip centred between
                      the fingers) and it drops the do-not-use band, whose whole
                      reason is a thumb hole to run the track over. It still moves
                      none of the motion coefficients: those are fitted to a
                      thumb-in chart, and guessing at a two-handed release would
                      be worse than saying nothing. */}
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
            {/* Back to the bowler's own saved numbers. The PAP, the hand and the
                grip are what a shared link overrides, so the way out of somebody
                else's measurements sits with them. At once, with no question
                first: nothing is saved here, so nothing is lost, and the
                fields above show the result as it lands (ADR-205). */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setPapOverride(null);
                setHandOverride(null);
                setGripOverride(null);
                setTurnedTo(null);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reset to your saved settings
            </Button>
          </section>
        </FormSheet>
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

      <ShareCardDialog
        open={card != null}
        card={card}
        link={{ url: shareUrl, title: `Layout ${formatDualAngle(layout)}` }}
        onClose={() => setCard(null)}
      />
    </PushScreen>
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
