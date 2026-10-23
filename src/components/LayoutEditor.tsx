import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Info, Lock, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { ProVeil } from "./ui/ProLock";
import { useProAccess } from "../lib/useProAccess";
import { Measure } from "./ui/Measure";
import { FIELD_MICRO_LABEL } from "./ui/field";
import {
  formatDualAngle,
  formatInches,
  formatVls,
  fromVls,
  toVls,
  type BallSpec,
  type DualAngleLayout
} from "../lib/ballLayout";
import type { LayoutSystem } from "../types/bowling";

/**
 * The three numbers of a layout, in whichever notation is being read, with the
 * other notation beside them saying the same thing.
 *
 * It lives here rather than inside the layout lab because two screens edit a
 * layout now: the lab, where nothing is saved, and the ball form, where the
 * numbers land on a ball in the arsenal. One component means the two can never
 * disagree about a slider's range or about what a VLS edit does to the dual
 * angle underneath it.
 *
 * Editing a VLS number is editing the layout. It converts back through the same
 * geometry (`fromVls`), so the two sets of sliders are two views of one state
 * rather than two states kept in step: there is nothing to drift.
 */
export function LayoutEditor({
  layout,
  onChange,
  ball,
  system,
  onSystemChange,
  idPrefix = "layout",
  proNumbers = false,
  beside
}: {
  layout: DualAngleLayout;
  onChange: (layout: DualAngleLayout) => void;
  ball: BallSpec;
  system: LayoutSystem;
  onSystemChange: (system: LayoutSystem) => void;
  /** Distinguishes two copies of the sliders when both are mounted, as they are
   *  when the lab is pushed over the ball form. */
  idPrefix?: string;
  /** The sliders are Pro here (the layout lab, ADR-170): without Pro they stay
   *  where they are, blurred under one tap, while the notation toggle above
   *  them stays free. The ball form leaves this off, since writing down a
   *  ball's own layout is recording it. */
  proNumbers?: boolean;
  /** A narrow control that rides at the end of the notation row, as the core
   *  type does in the lab (ADR-209): it changes what the numbers mean, so it
   *  sits with them rather than in a band of its own. */
  beside?: ReactNode;
}) {
  const vls = toVls(layout, ball);
  // The sliders under the veil are inert, but still there: with the veil taken
  // off in a browser's tools they would move, so without Pro they move nothing
  // (ADR-190).
  const { locked } = useProAccess();
  const frozen = proNumbers && locked;
  const change = useCallback(
    (next: DualAngleLayout) => {
      if (!frozen) onChange(next);
    },
    [frozen, onChange]
  );

  const set = useCallback(
    (patch: Partial<DualAngleLayout>) => change({ ...layout, ...patch }),
    [layout, change]
  );

  const setVls = useCallback(
    (patch: Partial<{ pinToPap: number; psaToPap: number; pinBuffer: number }>) => {
      const current = toVls(layout, ball);
      const next = fromVls(
        {
          pinToPap: patch.pinToPap ?? current.pinToPap,
          psaToPap: patch.psaToPap ?? current.psaToPap,
          pinBuffer: patch.pinBuffer ?? current.pinBuffer
        },
        ball
      );
      change({
        drillingAngle: next.drillingAngle,
        pinToPap: next.pinToPap,
        valAngle: next.valAngle
      });
    },
    [layout, ball, change]
  );

  return (
    <>
      {/* Both notations, always, and the one being edited is the one selected.
          These used to be two read-only boxes under a segmented control that
          said the same two words: the toggle's whole argument is that the two
          notations are one layout, so the boxes showing that layout in both are
          exactly the right thing to tap. One row instead of two, and nothing is
          hidden to get it. */}
      <div className={`grid gap-2 ${beside ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-2"}`}>
        <SystemCard
          label="Dual angle"
          value={formatDualAngle(layout)}
          selected={system === "dual"}
          onClick={() => onSystemChange("dual")}
          compact={beside != null}
        />
        <SystemCard
          label="Storm VLS"
          value={formatVls(vls)}
          selected={system === "vls"}
          onClick={() => onSystemChange("vls")}
          compact={beside != null}
        />
        {beside}
      </div>

      <NumbersVeil on={proNumbers}>
      {system === "dual" ? (
        <div className="space-y-0.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
          <Slider
            idPrefix={idPrefix}
            locked={frozen}
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
            idPrefix={idPrefix}
            locked={frozen}
            label="Pin to PAP"
            hint="Sets the flare. Peaks around 4 inches and falls away either side."
            value={layout.pinToPap}
            min={0.5}
            max={6}
            step={0.125}
            unit="in"
            onChange={(pinToPap) => set({ pinToPap })}
          />
          <Slider
            idPrefix={idPrefix}
            locked={frozen}
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
            idPrefix={idPrefix}
            locked={frozen}
            label="Pin to PAP"
            hint="The same first number in both systems."
            value={vls.pinToPap}
            min={0.5}
            max={6}
            step={0.125}
            unit="in"
            onChange={(pinToPap) => setVls({ pinToPap })}
          />
          {/* A symmetric ball has no PSA to PAP, so VLS is its other two numbers,
              said without a note: the two sliders read for themselves. */}
          {vls.psaToPap != null && (
            <Slider
              idPrefix={idPrefix}
              locked={frozen}
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
            idPrefix={idPrefix}
            locked={frozen}
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
      </NumbersVeil>
    </>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The sliders under a Pro veil, or as they are. */
function NumbersVeil({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    // As they are, unfaded, and still, with each thumb drawn as a lock: the
    // lock sits on the thing that will not move rather than over the card
    // (ADR-209). The whole card is still the one tap.
    <ProVeil clear bare what="Changing the layout">
      {children}
    </ProVeil>
  );
}

/**
 * A labelled range with its number beside it.
 *
 * A native range input rather than a hand-rolled drag: it is the one control
 * the platform already makes accessible, keyboard-operable and correctly sized
 * for a thumb, and the app has no slider primitive to reach for. If a screen
 * outside a layout wants one, this graduates to `components/ui/`.
 */
export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  idPrefix = "layout",
  locked = false
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: "deg" | "in";
  onChange: (value: number) => void;
  idPrefix?: string;
  /** Out of reach without Pro: the thumb is drawn as a lock, where it sits. */
  locked?: boolean;
}) {
  const shown = unit === "deg" ? `${Math.round(value)}°` : `${formatInches(value)}"`;
  const id = `${idPrefix}-slider-${label.replace(/\s+/g, "-").toLowerCase()}`;
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
        <span className="text-sm font-bold tabular-nums text-ink">
          <Measure>{shown}</Measure>
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`relative h-11 w-full cursor-pointer appearance-none bg-transparent ${
            locked ? "[&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-thumb]:opacity-0" : ""
          } [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-accent-fill [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-edge-strong [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-edge-strong [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-accent-fill [&::-webkit-slider-thumb]:shadow`}
        />
        {/* The lock in place of the thumb, at the thumb's own position: a 20px
            thumb travels the track less its own width. */}
        {locked && (
          <span
            data-slider-lock=""
            aria-hidden="true"
            className="pointer-events-none absolute top-[22px] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-accent-on-fill shadow"
            style={{ left: `calc(${clamp01((value - min) / (max - min || 1))} * (100% - 20px) - 2px)` }}
          >
            <Lock size={11} aria-hidden="true" />
          </span>
        )}
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
export function SystemCard({
  label,
  value,
  selected,
  onClick,
  compact = false
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
  /** Sharing its row with a third control: less side padding and a step
   *  smaller numbers, so the longest VLS reading still fits one line. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-w-0 rounded-xl border text-center shadow-sm active:opacity-80 ${
        compact ? "px-0.5 py-2" : "p-2.5"
      } ${selected ? "border-accent-fill bg-accent-soft" : "border-edge bg-surface"}`}
    >
      <span className={FIELD_MICRO_LABEL}>{label}</span>
      <span
        className={`block whitespace-nowrap font-bold tabular-nums text-accent ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        <LayoutNumbers value={value} />
      </span>
    </button>
  );
}

/**
 * A layout reading with its separators stepped back and its fractions stepped
 * down, so the numbers carry it.
 *
 * `45 x 4 1/2 x 45` is three measurements and two pieces of punctuation, and at
 * one weight the punctuation reads as loudly as the numbers: the eye lands on
 * the x's because they are the only repeated shape in the line. Dimming them
 * costs nothing and puts the emphasis where the meaning is. The fractions get
 * the same treatment one level down, through `Measure`.
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
export function LayoutNumbers({ value }: { value: string }) {
  const parts = value.split(" x ");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="font-normal text-ink-tertiary">{" x "}</span>}
          <Measure>{part}</Measure>
        </span>
      ))}
    </>
  );
}
