import { useCallback, useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { Measure } from "./ui/Measure";
import { FIELD_MICRO_LABEL } from "./ui/field";
import {
  DO_NOT_USE_BAND,
  formatDualAngle,
  formatInches,
  formatVls,
  fromVls,
  inDoNotUseBand,
  toVls,
  type BallSpec,
  type DualAngleLayout
} from "../lib/ballLayout";
import type { GripStyle, LayoutSystem } from "../types/bowling";

/**
 * The three numbers of a layout, in whichever notation is being read, with the
 * other notation beside them saying the same thing.
 *
 * It lives here rather than inside the layout lab because two screens edit a
 * layout now: the lab, where nothing is saved, and the ball form, where the
 * numbers land on a ball in the arsenal. One component means the two can never
 * disagree about a slider's range, about which numbers are the do-not-use band,
 * or about what a VLS edit does to the dual angle underneath it.
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
  grip = "1h",
  idPrefix = "layout"
}: {
  layout: DualAngleLayout;
  onChange: (layout: DualAngleLayout) => void;
  ball: BallSpec;
  system: LayoutSystem;
  onSystemChange: (system: LayoutSystem) => void;
  /** How the bowler holds the ball. The do-not-use band is a thumb-hole rule,
   *  so it is not marked on a two-hander's slider. */
  grip?: GripStyle;
  /** Distinguishes two copies of the sliders when both are mounted, as they are
   *  when the lab is pushed over the ball form. */
  idPrefix?: string;
}) {
  const vls = toVls(layout, ball);

  const set = useCallback(
    (patch: Partial<DualAngleLayout>) => onChange({ ...layout, ...patch }),
    [layout, onChange]
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
      onChange({
        drillingAngle: next.drillingAngle,
        pinToPap: next.pinToPap,
        valAngle: next.valAngle
      });
    },
    [layout, ball, onChange]
  );

  return (
    <>
      {/* Both notations, always, and the one being edited is the one selected.
          These used to be two read-only boxes under a segmented control that
          said the same two words: the toggle's whole argument is that the two
          notations are one layout, so the boxes showing that layout in both are
          exactly the right thing to tap. One row instead of two, and nothing is
          hidden to get it. */}
      <div className="grid grid-cols-2 gap-2">
        <SystemCard
          label="Dual angle"
          value={formatDualAngle(layout)}
          selected={system === "dual"}
          onClick={() => onSystemChange("dual")}
        />
        <SystemCard
          label="Storm VLS"
          value={formatVls(vls)}
          selected={system === "vls"}
          onClick={() => onSystemChange("vls")}
        />
      </div>

      {system === "dual" ? (
        <div className="space-y-0.5 rounded-xl border border-edge bg-surface p-2.5 shadow-sm">
          <Slider
            idPrefix={idPrefix}
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
            label="Pin to PAP"
            hint="Sets the flare. Peaks around 4 inches and falls away either side."
            value={layout.pinToPap}
            min={0.5}
            max={6}
            step={0.125}
            unit="in"
            warn={inDoNotUseBand(layout.pinToPap, grip)}
            band={grip === "1h" ? DO_NOT_USE_BAND : undefined}
            bandMin={0.5}
            bandMax={6}
            onChange={(pinToPap) => set({ pinToPap })}
          />
          <Slider
            idPrefix={idPrefix}
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
              No moulded PSA on a symmetric ball, so VLS is two numbers here. The pro shop names one
              in the thumb hole, which is where the ball shows it.
            </p>
          ) : (
            <Slider
              idPrefix={idPrefix}
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
    </>
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
  warn = false,
  band,
  bandMin,
  bandMax,
  idPrefix = "layout"
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
  idPrefix?: string;
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
          <Measure>{shown}</Measure>
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
