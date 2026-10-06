/**
 * The two-board line editor (foul-line board + target) with its focus-reveal
 * adjuster panel (nudge and move presets) and derived readout chain. Split out of
 * ActiveGameScorer, which hosts it twice through ShotDetailBar: once for the
 * Intended line, once for the Actual one.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHandedness } from "../lib/handednessContext";
import type { LineSpec } from "../types/bowling";
import { FIELD_MICRO_LABEL } from "./ui/field";

interface LineInputProps {
  label: string;
  value: LineSpec | undefined;
  onChange: (value: LineSpec | undefined) => void;
  /** Foul-line board this input edits: the Intended line takes a planned
   *  `stance`, the Actual line an observed `slide` (ADR-032). */
  foulField?: FoulField;
  /** Show the line-move preset chips (used for the intended line). */
  showPresets?: boolean;
  /** Derived slide board (stance − drift). Renders a read-only chip; Intended only. */
  derivedSlide?: number;
  /** Derived laydown board (slide − release offset, or the explicit override). Renders a read-only chip. */
  derivedLaydown?: number;
  /** Derived breakpoint (real apex only, ADR-028/031). Renders a read-only chip. */
  derivedBreakpoint?: { board: number; feet: number } | null;
  /** Tap on the laydown or breakpoint chip, opens the lane visualizer. */
  onLaydownTap?: () => void;
  /** Control rendered at the end of the section's eyebrow row (the lane view). */
  action?: React.ReactNode;
  /** Veto hook for a locked (completed) game: return false to drop the edit
   *  before any local text state moves, so the fields never drift from `value`. */
  onEditAttempt?: () => boolean;
  /** True while the game is locked. Read-only: asking `onEditAttempt` instead
   *  would raise the prompt, and a focus event is not a request to edit. */
  locked?: boolean;
}

// The foul-line board an input edits: a planned stance, or an observed slide.
type FoulField = "stance" | "slide";
// The board fields an input edits, the foul-line one plus the arrows.
type BoardField = FoulField | "target";
const FIELD_LABEL: Record<BoardField, string> = {
  stance: "Stance",
  slide: "Slide",
  target: "Target"
};
// Re-exported under the name the shot panels already use: a filled-in "23"
// still has to say whether it's a slide or a target.
export const floatLabel = FIELD_MICRO_LABEL;
// Section eyebrow (INTENDED / ACTUAL). Tight tracking, these are wide words.
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";

// Tap-gate for a locked (completed) game. Raising the prompt on `change` alone
// let the field focus first, so the keyboard and caret appeared behind the
// dialog; vetoing on pointerdown means the tap never lands on the control.
export const lockedTapBlocker =
  (onEditAttempt?: () => boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (onEditAttempt && !onEditAttempt()) e.preventDefault();
  };

// "X-Y" board move: X boards at the stance (feet), Y at the target (arrows).
const MOVE_PRESETS = [
  { label: "1-1", stance: 1, target: 1 },
  { label: "1.5-1", stance: 1.5, target: 1 },
  { label: "2-1", stance: 2, target: 1 }
];

// The foul-line boards allow a wider range than the target/breakpoint arrows: a
// bowler can stand (and slide) out to board 50, but targets cap at the 39 boards.
const maxForField = (field: BoardField) => (field === "target" ? 39 : 50);
const clampBoard = (n: number, max = 39) => Math.max(1, Math.min(max, Math.round(n * 10) / 10));

// Keep only digits and a single dot, capped at one decimal place. A trailing
// dot is preserved so "15." can be typed on the way to "15.5".
function sanitizeLine(raw: string): string {
  const s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  const intPart = s.slice(0, dot);
  const dec = s.slice(dot + 1).replace(/\./g, "").slice(0, 1);
  return `${intPart}.${dec}`;
}

function parseOneDp(s: string): number | undefined {
  if (!/\d/.test(s)) return undefined;
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : Math.round(n * 10) / 10;
}

export function LineInput({
  label,
  value,
  onChange,
  foulField = "stance",
  showPresets = false,
  derivedSlide,
  derivedLaydown,
  derivedBreakpoint,
  onLaydownTap,
  action,
  onEditAttempt,
  locked = false
}: LineInputProps) {
  const handedness = useHandedness();
  // Board numbers rise to the left for a right-hander, to the right for a
  // left-hander. dir = +1 means the LEFT arrow increases the board number.
  const dir = handedness === "right" ? 1 : -1;
  const fields: BoardField[] = [foulField, "target"];
  const toText = (v: LineSpec | undefined) =>
    Object.fromEntries(
      fields.map((f) => [f, v?.[f] != null ? String(v[f]) : ""])
    ) as Record<BoardField, string>;
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState<BoardField | null>(null);
  const blockLockedTap = lockedTapBlocker(onEditAttempt);
  const inputs = useRef<Partial<Record<BoardField, HTMLInputElement | null>>>({});
  // Pending close check, scheduled on blur and cancelled if focus lands back on
  // a board field. See the blur handler.
  const closeTimer = useRef<number | null>(null);

  // Re-sync from the prop only on external changes (carry-forward, spare-line
  // prefill, reset), not when the prop merely echoes the user's own edit, so
  // in-progress entries like "15." aren't wiped.
  useEffect(() => {
    setText((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        if (parseOneDp(prev[f] ?? "") !== value?.[f]) {
          next[f] = value?.[f] != null ? String(value[f]) : "";
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.stance, value?.slide, value?.target, value?.breakpoint]);

  // Merge field overrides into the spec + local text, then emit.
  // TODO(line-draw): future, given any two of stance/target/breakpoint (and a
  // real breakpoint distance + arrow distance), derive the third by drawing the
  // straight line, so the user can fix a breakpoint+target and read the laydown.
  function applyValues(updates: Partial<Record<BoardField, number | undefined>>) {
    if (onEditAttempt && !onEditAttempt()) return;
    const next: LineSpec = { ...value };
    for (const k of Object.keys(updates) as (BoardField)[]) {
      const v = updates[k];
      if (v == null) delete next[k];
      else next[k] = v;
    }
    setText((t) => {
      const nt = { ...t };
      for (const k of Object.keys(updates) as (BoardField)[]) {
        nt[k] = updates[k] != null ? String(updates[k]) : "";
      }
      return nt;
    });
    const hasAny = next[foulField] != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function update(field: BoardField, raw: string) {
    if (onEditAttempt && !onEditAttempt()) return;
    const s = sanitizeLine(raw);
    setText((t) => ({ ...t, [field]: s }));
    const v = parseOneDp(s);
    const next: LineSpec = { ...value };
    if (v === undefined) delete next[field];
    else next[field] = Math.max(1, Math.min(maxForField(field), v));
    const hasAny = next[foulField] != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function nudge(field: BoardField, delta: number) {
    const base = parseOneDp(text[field]) ?? value?.[field] ?? 20;
    applyValues({ [field]: clampBoard(base + delta, maxForField(field)) });
  }

  // Presets move the foul-line board and the target together.
  function move(foulDelta: number, targetDelta: number) {
    const s = parseOneDp(text[foulField]) ?? value?.[foulField] ?? 20;
    const t = parseOneDp(text.target) ?? value?.target ?? 20;
    applyValues({
      [foulField]: clampBoard(s + foulDelta, maxForField(foulField)),
      target: clampBoard(t + targetDelta, maxForField("target"))
    });
  }

  // A press on the panel is in flight. On iOS the press can still take focus
  // off the field (ADR-091), and the blur it raises must not close the panel
  // under the finger: the click that follows hands focus back.
  const pressing = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Where the panel sits, measured against the box the host gives it (the
  // scorer marks its two-column grid `data-adjuster-host` and the pin deck's
  // column `data-adjuster-bounds`): one row per adjuster over the deck, which
  // nobody taps while typing a board, centred on the fields it moves so the
  // eye goes sideways to it rather than up (ADR-118). A host without one gets
  // the panel straight above the fields.
  const [span, setSpan] = useState<{ left: number; width: number } | null>(null);
  // The last adjuster pressed, and a count that remounts its flash so a second
  // tap on the same side plays it again.
  const [flash, setFlash] = useState<{ name: string; n: number } | null>(null);

  useLayoutEffect(() => {
    if (!focused) return;
    const row = rowRef.current;
    // The deck's column is a sibling of the fields' column, not an ancestor,
    // so it is found through the grid that holds both.
    const bounds = row
      ?.closest<HTMLElement>("[data-adjuster-host]")
      ?.querySelector<HTMLElement>("[data-adjuster-bounds]");
    if (!row || !bounds) {
      setSpan(null);
      return;
    }
    const r = row.getBoundingClientRect();
    const b = bounds.getBoundingClientRect();
    setSpan(b.width > 0 ? { left: b.left - r.left, width: b.width } : null);
  }, [focused]);

  function closeUnlessFieldFocused() {
    const back = Object.values(inputs.current).some((el) => el && document.activeElement === el);
    if (back) return;
    setFocused(null);
    // A closed panel forgets its last press, or reopening it would replay one.
    setFlash(null);
  }

  /** Run an adjuster on click (never on pointerdown: a finger that lands to
   *  scroll, or slides off to cancel, records nothing), then hand focus back to
   *  the field the panel belongs to. */
  const onAdjust = (name: string, run: () => void) => () => {
    pressing.current = false;
    setFlash((f) => ({ name, n: (f?.n ?? 0) + 1 }));
    run();
    const field = focused;
    const el = field ? inputs.current[field] : null;
    if (el && document.activeElement !== el) el.focus();
  };

  // Cancelling mousedown's default is what keeps the field focused (and the
  // keyboard up) in every engine that synthesises mouse events from a tap.
  const keepFocus = (e: ReactMouseEvent<HTMLElement>) => e.preventDefault();
  const pressStart = (_e: ReactPointerEvent<HTMLElement>) => {
    pressing.current = true;
  };
  // A press that ends without a click (slid off, or turned into a scroll):
  // nothing ran, so settle the focus question the blur deferred.
  const pressEnd = () => {
    window.setTimeout(() => {
      if (!pressing.current) return;
      pressing.current = false;
      closeUnlessFieldFocused();
    }, 50);
  };

  // Direction reads twice, as in the lane view's quick moves (ADR-109): the
  // arrow is the way the line moves on screen, the word the way it moves on
  // the lane. In is up-board, which is screen-left for a right-hander.
  const leftIsIn = dir > 0;
  const adjusterRow = (
    key: string,
    label: React.ReactNode,
    name: string,
    onIn: () => void,
    onOut: () => void
  ) => {
    const side = (which: "in" | "out", arrow: "left" | "right") => {
      const sideName = `${name} ${which}`;
      const pressed = flash?.name === sideName ? flash.n : null;
      const Chevron = arrow === "left" ? ChevronLeft : ChevronRight;
      return (
        <button
          type="button"
          aria-label={sideName}
          onMouseDown={keepFocus}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerCancel={pressEnd}
          onClick={onAdjust(sideName, which === "in" ? onIn : onOut)}
          className={`relative flex min-w-11 flex-1 items-center justify-center gap-0.5 text-[10px] font-bold uppercase text-ink-secondary active:bg-edge ${
            arrow === "right" ? "flex-row-reverse" : ""
          }`}
        >
          {pressed != null && (
            <span
              key={pressed}
              aria-hidden="true"
              className="animate-adjust-flash pointer-events-none absolute inset-0 bg-accent-fill/40"
            />
          )}
          <Chevron
            key={pressed ?? "rest"}
            size={14}
            strokeWidth={3}
            aria-hidden="true"
            className={`relative text-ink-strong ${
              pressed != null ? `animate-adjust-kick-${arrow}` : ""
            }`}
          />
          <span className="relative">{which === "in" ? "In" : "Out"}</span>
        </button>
      );
    };
    return (
      <div
        key={key}
        className="flex h-11 items-stretch divide-x divide-edge overflow-hidden rounded-lg border border-edge-strong bg-surface-muted"
      >
        {side(leftIsIn ? "in" : "out", "left")}
        <span className="flex w-12 shrink-0 flex-col items-center justify-center text-xs font-semibold leading-none tabular-nums text-ink">
          {label}
        </span>
        {side(leftIsIn ? "out" : "in", "right")}
      </div>
    );
  };

  useEffect(() => () => {
    if (closeTimer.current != null) clearTimeout(closeTimer.current);
  }, []);

  // Derived readouts, in the order the ball meets them going down the lane.
  // Rendered as one tappable chain rather than separate pills: they are a
  // sequence, and reading them as one line is both truer and shorter.
  const chain: string[] = [];
  if (derivedSlide != null) chain.push(`Slide ${derivedSlide}`);
  if (derivedLaydown != null) chain.push(`Laydown ${derivedLaydown}`);
  if (derivedBreakpoint != null) {
    chain.push(
      `Break ${Math.round(derivedBreakpoint.board * 2) / 2} (${Math.round(derivedBreakpoint.feet)}ft)`
    );
  }

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className={eyebrow}>{label}</span>
        {action}
      </div>
      <div ref={rowRef} className="relative flex gap-1.5">
        {focused && adjusterPanel()}
        {fields.map((field) => (
          <label key={field} className="min-w-0 flex-1">
            <span className={floatLabel}>{FIELD_LABEL[field]}</span>
            <input
              type="text"
              inputMode="decimal"
              ref={(el) => { inputs.current[field] = el; }}
              value={text[field]}
              onPointerDown={blockLockedTap}
              onChange={(e) => update(field, e.target.value)}
              // iOS Safari focuses a form control on tap even when the
              // pointerdown was preventDefault()ed, so the veto that raises the
              // edit prompt does not actually keep focus off a locked field.
              // Hand it straight back: a focused field is what let the prompt
              // reappear the moment it was cancelled, because the overlay
              // restores focus on close and the field asked to edit again.
              onFocus={(e) => {
                if (locked) { e.currentTarget.blur(); return; }
                setFocused(field);
              }}
              onBlur={() => {
                // Ask on the next tick where focus actually ended up: a press on
                // the panel hands it straight back (ADR-091). A press still in
                // flight is left to settle it, so the panel cannot unmount
                // between the finger landing and the click.
                if (closeTimer.current != null) clearTimeout(closeTimer.current);
                closeTimer.current = window.setTimeout(() => {
                  closeTimer.current = null;
                  if (!pressing.current) closeUnlessFieldFocused();
                }, 0);
              }}
              className="h-9 w-full min-w-0 rounded-lg border border-edge-strong bg-surface-muted text-center text-sm font-semibold tabular-nums text-ink focus:border-accent-fill focus:bg-surface focus:outline-none"
              title={field === "target" ? "Target board (arrows)" : `${FIELD_LABEL[field]} board`}
            />
          </label>
        ))}
      </div>

      {chain.length > 0 && (
        <button
          type="button"
          onClick={onLaydownTap}
          title="Derived from what you entered. Tap to see it on the lane."
          className="mt-1 flex w-full flex-wrap items-center gap-x-1 text-left text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary tabular-nums hover:text-accent"
        >
          {chain.map((part, i) => (
            <span key={part} className="flex items-center gap-1 whitespace-nowrap">
              {i > 0 && <span aria-hidden="true" className="text-ink-tertiary">→</span>}
              {part}
            </span>
          ))}
        </button>
      )}

    </div>
  );

  /**
   * The focus-reveal adjusters: a nudge for the focused field and, on the
   * Intended line, the three move presets, one to a row over the pin deck
   * (ADR-117). They never open below the fields (ADR-114). Below, they landed on the keyboard and
   * its toolbar, sat over the Actual boxes (whose eye button's hit region
   * reaches up into the last row), and pushed everything under them down on
   * every focus. Floating, they move nothing, and every one of them is still a
   * single tap away while the bowler is typing.
   */
  function adjusterPanel() {
    if (!focused) return null;
    const presets = showPresets && (focused === "stance" || focused === "target");
    const nudgeName = `${FIELD_LABEL[focused]} 0.5`;
    return (
      <div
        role="group"
        aria-label="Adjust line"
        onMouseDown={keepFocus}
        style={span ? { left: span.left, width: span.width } : undefined}
        className={`absolute z-30 flex flex-col gap-1.5 rounded-xl border border-edge bg-surface p-1.5 shadow-lg ${
          span ? "top-1/2 -translate-y-1/2" : "inset-x-0 bottom-full mb-1.5"
        }`}
      >
        {adjusterRow(
          "nudge",
          <>
            <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-secondary">
              {FIELD_LABEL[focused]}
            </span>
            ±0.5
          </>,
          nudgeName,
          () => nudge(focused, 0.5),
          () => nudge(focused, -0.5)
        )}
        {presets &&
          MOVE_PRESETS.map((p) =>
            adjusterRow(
              p.label,
              p.label,
              `Move ${p.label}`,
              () => move(p.stance, p.target),
              () => move(-p.stance, -p.target)
            )
          )}
      </div>
    );
  }
}
