/**
 * The two-board line editor (foul-line board + target) with its focus-reveal
 * adjusters, move presets and derived readout chain. Split out of
 * ActiveGameScorer, which hosts it twice through ShotDetailBar: once for the
 * Intended line, once for the Actual one.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useState } from "react";
import { useHandedness } from "../lib/handednessContext";
import type { LineSpec } from "../types/bowling";
import { Button } from "./ui/Button";
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
  /** Fired when any field gains focus — used by the Actual line to autofill. */
  onFieldFocus?: () => void;
  /** Derived slide board (stance − drift). Renders a read-only chip; Intended only. */
  derivedSlide?: number;
  /** Derived laydown board (slide − release offset, or the explicit override). Renders a read-only chip. */
  derivedLaydown?: number;
  /** Derived breakpoint (real apex only — ADR-028/031). Renders a read-only chip. */
  derivedBreakpoint?: { board: number; feet: number } | null;
  /** Tap on the laydown or breakpoint chip — opens the lane visualizer. */
  onLaydownTap?: () => void;
  /** Control rendered at the end of the section's eyebrow row (the lane view). */
  action?: React.ReactNode;
  /** Veto hook for a locked (completed) game: return false to drop the edit
   *  before any local text state moves, so the fields never drift from `value`. */
  onEditAttempt?: () => boolean;
}

// The foul-line board an input edits: a planned stance, or an observed slide.
type FoulField = "stance" | "slide";
// The board fields an input edits — the foul-line one plus the arrows.
type BoardField = FoulField | "target";
const FIELD_LABEL: Record<BoardField, string> = {
  stance: "Stance",
  slide: "Slide",
  target: "Target"
};
// Re-exported under the name the shot panels already use: a filled-in "23"
// still has to say whether it's a slide or a target.
export const floatLabel = FIELD_MICRO_LABEL;
// Section eyebrow (INTENDED / ACTUAL). Tight tracking — these are wide words.
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
  onFieldFocus,
  derivedSlide,
  derivedLaydown,
  derivedBreakpoint,
  onLaydownTap,
  action,
  onEditAttempt
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

  // Re-sync from the prop only on external changes (carry-forward, spare-line
  // prefill, reset) — not when the prop merely echoes the user's own edit, so
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
  // TODO(line-draw): future — given any two of stance/target/breakpoint (and a
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

  // Single full-width button per adjuster: label centered, arrows at the edges,
  // and the tapped half (left vs right of centre) decides the direction. One
  // border, no ugly split. preventDefault keeps the input focused (row open).
  const adjBtn =
    "relative flex h-8 w-full items-center justify-center rounded-lg border border-edge bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary hover:bg-surface-muted active:bg-edge";
  const halfTap =
    (onLeft: () => void, onRight: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      (e.clientX - r.left < r.width / 2 ? onLeft : onRight)();
    };

  // Derived readouts, in the order the ball meets them going down the lane.
  // Rendered as one tappable chain rather than separate pills: they are a
  // sequence, and reading them as one line is both truer and shorter.
  const chain: string[] = [];
  if (derivedSlide != null) chain.push(`Slide ${derivedSlide}`);
  if (derivedLaydown != null) chain.push(`Laydown ${derivedLaydown}`);
  if (derivedBreakpoint != null) {
    chain.push(
      `Bkpt ${Math.round(derivedBreakpoint.board * 2) / 2} (${Math.round(derivedBreakpoint.feet)}ft)`
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={eyebrow}>{label}</span>
        {action}
      </div>
      <div className="flex gap-1.5">
        {fields.map((field) => (
          <label key={field} className="min-w-0 flex-1">
            <span className={floatLabel}>{FIELD_LABEL[field]}</span>
            <input
              type="text"
              inputMode="decimal"
              value={text[field]}
              onPointerDown={blockLockedTap}
              onChange={(e) => update(field, e.target.value)}
              onFocus={() => { onFieldFocus?.(); setFocused(field); }}
              onBlur={() => setFocused((f) => (f === field ? null : f))}
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

      {/* Focus-reveal board adjusters. Each arrow pair gets its own full-width
          row with large tap targets. Actions run on pointerdown + preventDefault:
          keeps the input focused (row stays open) and fires reliably on touch,
          where a preventDefault pointerdown otherwise suppresses the click.
          Direction respects handedness — for a right-hander the LEFT arrow
          increases the board number. */}
      {focused && (
        <div className="mt-2">
          <Button
            variant="secondary"
            className="relative w-full text-[11px] font-semibold uppercase tracking-[0.08em]"
            aria-label={`${FIELD_LABEL[focused]} ±0.5. Tap left to ${dir > 0 ? "increase" : "decrease"}, right to ${dir > 0 ? "decrease" : "increase"}`}
            onPointerDown={halfTap(() => nudge(focused, 0.5 * dir), () => nudge(focused, -0.5 * dir))}
          >
            <ChevronLeft aria-hidden="true" size={16} strokeWidth={3} className="absolute left-3 text-ink-strong" />
            {FIELD_LABEL[focused]} ±0.5
            <ChevronRight aria-hidden="true" size={16} strokeWidth={3} className="absolute right-3 text-ink-strong" />
          </Button>
        </div>
      )}

      {/* Move presets: one full-width button per preset; tapping its left/right
          half moves toward higher/lower boards. Only while stance/target focused. */}
      {showPresets && (focused === "stance" || focused === "target") && (
        <div className="mt-2 space-y-2">
          {MOVE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={adjBtn}
              aria-label={`Move ${p.label}. Tap left for ${dir > 0 ? "higher" : "lower"} boards, right for ${dir > 0 ? "lower" : "higher"}`}
              onPointerDown={halfTap(() => move(p.stance * dir, p.target * dir), () => move(-p.stance * dir, -p.target * dir))}
            >
              <ChevronLeft aria-hidden="true" size={16} strokeWidth={3} className="absolute left-3 text-ink-strong" />
              Move {p.label}
              <ChevronRight aria-hidden="true" size={16} strokeWidth={3} className="absolute right-3 text-ink-strong" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
