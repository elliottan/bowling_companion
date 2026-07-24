import { Eye, Plus, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildLiveFrame,
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, isSpare } from "../lib/scoring";
import { useHandedness } from "../lib/handednessContext";
import { useDriftModel } from "../lib/driftModelContext";
import {
  deriveLaydown,
  deriveLaydownFromSlide,
  deriveSlide,
  deriveSlideFromLaydown,
  deriveStanceFromLaydown
} from "../lib/driftModel";
import { derivedApexForDisplay } from "../lib/laneGeometry";
import { freshRackSeedShot, laneForFrame } from "../lib/lanes";
import { getBalls, getSpareLineByPins } from "../services/ballRepository";
import type { Ball, Frame, Game, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { BallPickerSheet } from "./BallPickerSheet";
import { CatalogBallImage } from "./CatalogBallImage";
import { ConfirmDialog } from "./ConfirmDialog";
import { LaneVisualizer } from "./LaneVisualizer";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";
import { SpareLineFormDialog } from "./SpareLineFormDialog";
import { Button } from "./ui/Button";
import { TAP_TARGET_44 } from "./ui/Chip";
import { IconButton } from "./ui/IconButton";

/** "10-pin" for a single, "3-10" for multi. */
function formatLeavePins(pins: PinNumber[]): string {
  return pins.length === 1 ? `${pins[0]}-pin` : pins.join("-");
}

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
// A field label parked on the top border of its own box. Costs no vertical band
// of its own, and a filled-in "23" still says whether it's a slide or a target.
const floatLabel =
  "pointer-events-none absolute -top-1.5 left-2 z-10 bg-surface px-1 text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";
// Section eyebrow (INTENDED / ACTUAL). Tight tracking — these are wide words.
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";

// Tap-gate for a locked (completed) game. Raising the prompt on `change` alone
// let the field focus first, so the keyboard and caret appeared behind the
// dialog; vetoing on pointerdown means the tap never lands on the control.
const lockedTapBlocker =
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
  let s = raw.replace(/[^\d.]/g, "");
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

function LineInput({
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
          <label key={field} className="relative min-w-0 flex-1">
            <span className={floatLabel}>{FIELD_LABEL[field]}</span>
            <input
              type="text"
              inputMode="decimal"
              value={text[field]}
              onPointerDown={blockLockedTap}
              onChange={(e) => update(field, e.target.value)}
              onFocus={() => { onFieldFocus?.(); setFocused(field); }}
              onBlur={() => setFocused((f) => (f === field ? null : f))}
              className="h-9 w-full min-w-0 rounded-lg border border-edge bg-surface-muted text-center text-sm font-semibold tabular-nums text-ink focus:border-felt-700 focus:bg-surface focus:outline-none"
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
            aria-label={`${FIELD_LABEL[focused]} ±0.5 — tap left to ${dir > 0 ? "increase" : "decrease"}, right to ${dir > 0 ? "decrease" : "increase"}`}
            onPointerDown={halfTap(() => nudge(focused, 0.5 * dir), () => nudge(focused, -0.5 * dir))}
          >
            <span aria-hidden="true" className="absolute left-3 text-base font-bold text-ink-strong">◀</span>
            {FIELD_LABEL[focused]} ±0.5
            <span aria-hidden="true" className="absolute right-3 text-base font-bold text-ink-strong">▶</span>
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
              aria-label={`Move ${p.label} — tap left for ${dir > 0 ? "higher" : "lower"} boards, right for ${dir > 0 ? "lower" : "higher"}`}
              onPointerDown={halfTap(() => move(p.stance * dir, p.target * dir), () => move(-p.stance * dir, -p.target * dir))}
            >
              <span aria-hidden="true" className="absolute left-3 text-base font-bold text-ink-strong">◀</span>
              Move {p.label}
              <span aria-hidden="true" className="absolute right-3 text-base font-bold text-ink-strong">▶</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ShotDetailBarProps {
  balls: Ball[];
  ballId: number | undefined;
  onBallChange: (id: number | undefined) => void;
  intended: LineSpec | undefined;
  onIntendedChange: (line: LineSpec | undefined) => void;
  actual: LineSpec | undefined;
  onActualChange: (line: LineSpec | undefined) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onOpenArsenal?: () => void;
  /** Standing leave the shot faces (spare attempt) — undefined on a fresh rack. */
  spareLeave?: PinNumber[];
  /** Veto hook for a locked (completed) game — see LineInputProps. */
  onEditAttempt?: () => boolean;
  /** True while the "Edit this completed game?" confirm (raised by
   *  onEditAttempt) is open — passed through to the nested LaneVisualizer so
   *  it suspends its own Escape/focus-trap while that confirm sits on top. */
  editPromptOpen?: boolean;
}

// Every field is always editable; remounting (via `key`) per selected shot
// resets local line text to that shot's stored values.
function ShotDetailBar({
  balls,
  ballId,
  onBallChange,
  intended,
  onIntendedChange,
  actual,
  onActualChange,
  notes,
  onNotesChange,
  onOpenArsenal,
  spareLeave,
  onEditAttempt,
  editPromptOpen
}: ShotDetailBarProps) {
  const [showViz, setShowViz] = useState<"intended" | "actual" | null>(null);
  const [showBallPicker, setShowBallPicker] = useState(false);
  const blockLockedTap = lockedTapBlocker(onEditAttempt);
  const selectedBall = balls.find((b) => b.id === ballId);
  const selectedSnap = selectedBall?.catalog_snapshot;
  const driftModel = useDriftModel();
  const handedness = useHandedness();
  const isSpareAttempt = !!spareLeave?.length;

  const derivedSlide =
    intended?.stance != null ? deriveSlide(intended.stance, driftModel) : undefined;
  const derivedLaydown =
    intended?.laydown ??
    (intended?.stance != null ? deriveLaydown(intended.stance, driftModel) : undefined);

  // Legacy Actual lines (ADR-032) stored a stance. Show its derived slide so the
  // box is never blank; the stored row is left alone until the shot is edited.
  const actualView: LineSpec | undefined = actual
    ? {
        ...actual,
        slide:
          actual.slide ??
          (actual.stance != null ? deriveSlide(actual.stance, driftModel) : undefined)
      }
    : actual;
  const actualLaydown =
    actualView?.laydown ??
    (actualView?.slide != null
      ? deriveLaydownFromSlide(actualView.slide, driftModel)
      : undefined);

  // Never a spare-aim concept (ADR-031): suppressed entirely for spare attempts.
  const apexFor = (line: LineSpec | undefined, laydown: number | undefined) =>
    isSpareAttempt || !line
      ? null
      : derivedApexForDisplay({ ...line, laydown: line.laydown ?? laydown }, handedness);
  const derivedBreakpoint = apexFor(intended, derivedLaydown);
  const actualBreakpoint = apexFor(actualView, actualLaydown);

  // Keep stance/laydown in sync (ADR-030 drift model): whichever one the user
  // just edited (typed stance here, or dragged laydown in the visualizer)
  // drives the other. Only reacts to user edits routed through this handler —
  // carry-forward/prefill paths set intendedLine directly and skip it.
  // No guard here: every caller is already gated — the LineInput vets its own
  // edits, and the visualizer routes user drags through its onEditAttempt (its
  // auto-seed effects call onChange directly and must NOT raise the prompt).
  function handleIntendedChange(next: LineSpec | undefined) {
    if (!next) { onIntendedChange(next); return; }
    const merged = { ...next };
    if (merged.stance !== intended?.stance && merged.stance != null) {
      merged.laydown = deriveLaydown(merged.stance, driftModel);
    } else if (merged.laydown !== intended?.laydown && merged.laydown != null) {
      merged.stance = deriveStanceFromLaydown(merged.laydown, driftModel);
    }
    onIntendedChange(merged);
  }

  // Actual lines are slide-based (ADR-032): slide ⇄ laydown keep each other in
  // sync across the release offset, with no drift step. A legacy `stance` is
  // dropped on the first edit — slide is the field of record from then on.
  function handleActualChange(next: LineSpec | undefined) {
    if (!next) { onActualChange(next); return; }
    const merged = { ...next };
    if (merged.slide !== actualView?.slide && merged.slide != null) {
      merged.laydown = deriveLaydownFromSlide(merged.slide, driftModel);
    } else if (merged.laydown !== actualView?.laydown && merged.laydown != null) {
      merged.slide = deriveSlideFromLaydown(merged.laydown, driftModel);
    }
    if (merged.slide != null) delete merged.stance;
    onActualChange(merged);
  }

  // One icon control per line, sitting in that line's eyebrow row. Full-width
  // "View … line" buttons cost 72px of the panel's height for two taps that are
  // reachable from the derived chain underneath as well.
  const viewButton = (which: "intended" | "actual") => (
    <IconButton
      label={`View ${which} line`}
      title={`View ${which} line on the lane`}
      onClick={() => setShowViz(which)}
    >
      <Eye size={14} aria-hidden="true" />
    </IconButton>
  );

  return (
    <div className="divide-y divide-edge rounded-xl border border-edge bg-surface px-2.5">
      {/* Ball: the chosen ball IS the control — its thumbnail and name, tapped to
          open the picker. No "Ball" eyebrow, no select chrome, no second icon. */}
      <div className="flex items-center py-1.5">
        {balls.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (onEditAttempt && !onEditAttempt()) return;
              setShowBallPicker(true);
            }}
            aria-label={`Ball: ${selectedBall?.name ?? "none"} — tap to change`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left hover:bg-surface-muted"
          >
            <span className="h-7 w-7 shrink-0">
              {selectedSnap ? (
                <CatalogBallImage
                  src={selectedSnap.imageThumb}
                  alt=""
                  brand={selectedSnap.brand as Manufacturer}
                  size="thumb"
                />
              ) : (
                <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
              )}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-xs font-semibold ${
                selectedBall ? "text-ink" : "text-ink-secondary"
              }`}
            >
              {selectedBall?.name ?? "No ball"}
              {selectedBall?.is_spare_ball && (
                <span className="ml-1 font-normal text-ink-secondary">spare</span>
              )}
            </span>
          </button>
        ) : (
          <Button variant="ghost" onClick={onOpenArsenal} className="text-xs">
            <Plus size={14} aria-hidden="true" />
            Add a ball
          </Button>
        )}
      </div>

      {showBallPicker && (
        <BallPickerSheet
          balls={balls}
          ballId={ballId}
          onSelect={onBallChange}
          onClose={() => setShowBallPicker(false)}
          onOpenArsenal={onOpenArsenal}
        />
      )}

      <div className="py-1.5">
        <LineInput
          label="Intended"
          value={intended}
          onChange={handleIntendedChange}
          showPresets
          onEditAttempt={onEditAttempt}
          derivedSlide={derivedSlide}
          derivedLaydown={derivedLaydown}
          derivedBreakpoint={derivedBreakpoint}
          onLaydownTap={() => setShowViz("intended")}
          action={viewButton("intended")}
        />
      </div>

      {/* Actual may stay blank, but focusing any field while all three are blank
          autofills from the current Intended line (a quick "shot it as planned").
          The intended line is stance-based, so its foul-line board converts to a
          slide on the way in. */}
      <div className="py-1.5">
        <LineInput
          label="Actual"
          value={actualView}
          onChange={handleActualChange}
          foulField="slide"
          onEditAttempt={onEditAttempt}
          derivedLaydown={actualLaydown}
          derivedBreakpoint={actualBreakpoint}
          onLaydownTap={() => setShowViz("actual")}
          action={viewButton("actual")}
          onFieldFocus={() => {
            if (!actual && intended) {
              if (onEditAttempt && !onEditAttempt()) return;
              const { stance, ...rest } = intended;
              handleActualChange({
                ...rest,
                slide: stance != null ? deriveSlide(stance, driftModel) : undefined
              });
            }
          }}
        />
      </div>

      {showViz && (
        <LaneVisualizer
          title={showViz === "actual" ? "Actual line" : "Intended line"}
          line={showViz === "actual" ? actualView : intended}
          onChange={showViz === "actual" ? handleActualChange : handleIntendedChange}
          onEditAttempt={onEditAttempt}
          // The actual line records where the ball finished, so it opens with the
          // foul line and arrows pinned: the first thing you can drag is the
          // final board, and the path re-solves back to what you entered.
          defaultLocks={showViz === "actual" ? ["laydown", "target"] : undefined}
          spare={isSpareAttempt}
          leave={spareLeave}
          onClose={() => setShowViz(null)}
          suspended={editPromptOpen}
        />
      )}

      {/* Notes: fixed at two lines and scrolled internally rather than auto-grown,
          so a long note can't push the rest of the panel off-screen. */}
      <div className="py-1.5">
        <label className="relative block">
          <span className={floatLabel}>Notes</span>
          <textarea
            value={notes}
            onPointerDown={blockLockedTap}
            onChange={(e) => {
              if (onEditAttempt && !onEditAttempt()) return;
              onNotesChange(e.target.value);
            }}
            onBlur={() => {
              const trimmed = notes.trim();
              if (trimmed !== notes) onNotesChange(trimmed);
            }}
            rows={2}
            placeholder="This shot…"
            className="w-full resize-none overflow-y-auto rounded-lg border border-edge bg-surface-muted px-2 pb-1 pt-1.5 text-[11px] leading-snug text-ink placeholder:text-ink-tertiary focus:border-felt-700 focus:bg-surface focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}

export type ScorerMode = "standalone" | "session";

interface ActiveGameScorerProps {
  gameKey?: number | string;
  initialFrames?: Frame[];
  /** Recorded frames from OTHER games in the same session, oldest first. Used to
   *  reuse a per-session intended spare line for an identical leave. */
  sessionFrames?: Frame[];
  /** Earlier games in the session (oldest first), with lane config + frames.
   *  Used to carry line/ball/notes across games on the same physical lane. */
  previousGames?: Array<{
    game: Pick<Game, "lanes" | "start_lane" | "lane_number">;
    frames: Frame[];
  }>;
  mode?: ScorerMode;
  game?: Pick<Game, "lanes" | "start_lane" | "lane_number">;
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
  /** Open the game-level lane editor (lane pair + starting lane). */
  onEditLanes?: () => void;
  /** Jump to the Arsenal screen to manage balls. */
  onOpenArsenal?: () => void;
}

const pinsKey = (p: PinNumber[]) => [...p].sort((a, b) => a - b).join(",");
const lineHasValue = (l: LineSpec | undefined) =>
  !!l && (l.stance != null || l.target != null || l.breakpoint != null);

/**
 * The intended line of the most recent earlier spare attempt this session that
 * faced the same leave. Scans non-10th frames (keyed by the leave standing pins);
 * returns the last match's intended line, or undefined.
 */
function sessionSpareIntended(frames: Frame[], leave: PinNumber[]): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    if (f.frame_number === 10) continue;
    const first = f.shots[0];
    const second = f.shots[1];
    if (!first || !second) continue;
    if (pinsKey(first.pins_standing) !== key) continue;
    if (lineHasValue(second.intended)) found = second.intended;
  }
  return found;
}

/** Pins available entering a given shot of a frame (for editing a past shot). */
function availableEnteringShot(frame: Frame, shotIndex: number): PinNumber[] | undefined {
  if (shotIndex === 0) return undefined; // fresh rack — all pins available
  const prev = frame.shots[shotIndex - 1]?.pins_standing;
  return prev && prev.length > 0 ? prev : undefined;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  sessionFrames = [],
  previousGames = [],
  mode = "standalone",
  game,
  onFrameComplete,
  onGameComplete,
  onEditLanes,
  onOpenArsenal
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() => hydrateFrameController(initialFrames));
  const [errorMessage, setErrorMessage] = useState("");
  const [balls, setBalls] = useState<Ball[]>([]);
  // Live (next-unbowled) shot draft. Only used when no recorded shot is selected.
  const [selectedBallId, setSelectedBallId] = useState<number | undefined>(undefined);
  const [intendedLine, setIntendedLine] = useState<LineSpec | undefined>(undefined);
  const [actualLine, setActualLine] = useState<LineSpec | undefined>(undefined);
  const [shotNotes, setShotNotes] = useState("");
  // Cursor: a recorded shot being edited inline (null = live entry).
  const [selectedShot, setSelectedShot] = useState<{ frameNumber: number; shotIndex: number } | null>(null);
  // Shot we last applied carry-forward defaults to (once per live shot).
  const lastDefaultedShot = useRef<string | null>(null);
  // A just-converted spare whose leave has no saved Spare Line — offered as a
  // dismissible banner so the line can be captured in the moment.
  const [pendingSpareLeave, setPendingSpareLeave] = useState<{ pins: PinNumber[]; notes?: string } | null>(null);
  const [showSpareLineDialog, setShowSpareLineDialog] = useState(false);
  // A finished game is locked: the first edit attempt raises a confirm prompt
  // instead of applying, so a stray pin tap can't silently rewrite a recorded
  // shot (there is no undo). Confirming unlocks the rest of the visit;
  // cancelling leaves it locked so the next attempt asks again. Moving to
  // another game (gameKey) re-locks.
  const [unlocked, setUnlocked] = useState(false);
  const [showEditPrompt, setShowEditPrompt] = useState(false);

  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const lanesList = game?.lanes ?? (game?.lane_number ? [game.lane_number] : []);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  const recordedFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;
  const recordedShot = recordedFrame && selectedShot ? recordedFrame.shots[selectedShot.shotIndex] ?? null : null;
  const isEditing = Boolean(recordedShot);
  const locked = gameState.isComplete && !unlocked;

  /** Gate every user edit on a completed game. Returns false (and raises the
   *  prompt) while locked; the caller must drop the edit. */
  function requestEdit(): boolean {
    if (!locked) return true;
    setShowEditPrompt(true);
    return false;
  }

  // Label for the primary button: "Strike" on a fresh rack (first ball or a
  // 10th-frame bonus ball), "Spare" when shooting at a leave. While editing,
  // derive from the pins available entering the selected shot.
  const editStrikeOrSpareLabel = (() => {
    if (isEditing && recordedFrame && selectedShot) {
      const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
      return (avail?.length ?? 10) === 10 ? "Strike" : "Spare";
    }
    return isFreshRack ? "Strike" : "Spare";
  })();

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setErrorMessage("");
    setSelectedShot(null);
    setUnlocked(false);
    setShowEditPrompt(false);
    lastDefaultedShot.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  // Push the live draft into the controller's currentShotMeta.
  useEffect(() => {
    const meta: ShotMetadata = {
      ball_id: selectedBallId,
      intended: intendedLine,
      actual: actualLine,
      notes: shotNotes.trim() || undefined
    };
    setGameState((curr) => updateShotMeta(curr, meta));
  }, [selectedBallId, intendedLine, actualLine, shotNotes]);

  // On completion, default to reviewing/editing the final frame's last shot.
  useEffect(() => {
    if (gameState.isComplete && selectedShot === null) {
      const tenth = gameState.frames.find((f) => f.frame_number === 10);
      if (tenth && tenth.shots.length > 0) {
        setSelectedShot({ frameNumber: 10, shotIndex: tenth.shots.length - 1 });
      }
    }
  }, [gameState.isComplete, gameState.frames, selectedShot]);

  // Per-shot defaults (live entry only): notes + actual always blank; intended and
  // ball are carried by context. See ADR-017 for the full carry-rule priority.
  useEffect(() => {
    if (selectedShot !== null || gameState.isComplete) return;
    const key = `${gameState.currentFrameNumber}-${gameState.currentShot}`;
    if (lastDefaultedShot.current === key) return;
    lastDefaultedShot.current = key;

    setShotNotes("");
    setActualLine(undefined);

    const spareBall = balls.find((b) => b.is_spare_ball);
    const currentFrame = gameState.frames.find(
      (f) => f.frame_number === gameState.currentFrameNumber
    );

    if (gameState.currentShot === 1) {
      // First ball: carry line + ball + notes from the previous same-lane
      // frame in THIS game, else from the previous game on the same lane,
      // else leave everything blank/unselected.
      const prevShot = freshRackSeedShot(
        game,
        gameState.currentFrameNumber,
        [],
        gameState.frames,
        previousGames
      );
      setIntendedLine(prevShot?.intended);
      setShotNotes(prevShot?.notes ?? "");
      setSelectedBallId(prevShot?.ball_id);
    } else if (gameState.availablePins.length < 10) {
      // True second ball (spare attempt): ball = spare ball if configured,
      // else carry shot-1's ball. Line from session/saved spare line.
      const shotOneBall = currentFrame?.shots[0]?.ball_id;
      setSelectedBallId(spareBall?.id ?? shotOneBall);

      const leave = gameState.availablePins;
      const sessionLine = sessionSpareIntended(
        [...sessionFrames, ...gameState.frames],
        leave
      );
      if (sessionLine) {
        setIntendedLine({ ...sessionLine });
        return;
      }
      setIntendedLine(undefined);
      getSpareLineByPins(leave)
        .then((sl) => {
          if (lastDefaultedShot.current !== key) return;
          const line = sl?.line
            ? {
                ...(sl.line.stance != null && { stance: sl.line.stance }),
                ...(sl.line.target != null && { target: sl.line.target })
              }
            : undefined;
          const applied = !!(line && Object.keys(line).length);
          setIntendedLine(applied ? line : undefined);
        })
        .catch(() => {});
    } else {
      // Fresh-rack bonus ball (10th after strike/spare): carry line + ball
      // from the most recent fresh-rack shot (see ADR-029).
      const prevShot = freshRackSeedShot(
        game,
        gameState.currentFrameNumber,
        currentFrame?.shots ?? [],
        gameState.frames,
        previousGames
      );
      setIntendedLine(prevShot?.intended);
      setSelectedBallId(prevShot?.ball_id);
    }
  }, [
    gameState.currentFrameNumber,
    gameState.currentShot,
    gameState.availablePins,
    gameState.isComplete,
    gameState.frames,
    selectedShot,
    sessionFrames,
    previousGames,
    balls,
    game
  ]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  async function persistFrame(frame: Frame) {
    try {
      await onFrameComplete?.(frame);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  // Edit a recorded shot's metadata only — no cascade, other shots untouched.
  function handleEditMeta(meta: ShotMetadata) {
    if (!selectedShot || locked) return;
    const { frameNumber, shotIndex } = selectedShot;
    const frames = editFrameShotMeta(gameState.frames, frameNumber, shotIndex, meta);
    setGameState((s) => ({ ...s, frames }));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // Edit a recorded shot's pins — re-derive the frame, rescore, persist.
  function handleEditPins(pins: PinNumber[]) {
    if (!selectedShot || locked) return;
    const { frameNumber } = selectedShot;
    const frames = editFrameShotPins(gameState.frames, frameNumber, selectedShot.shotIndex, pins);
    setGameState(hydrateFrameController(frames));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // After a live spare conversion, offer to capture its line when the leave has
  // no saved Spare Line (or only a bare row with no targeting data).
  async function offerSpareLine(frame: Frame) {
    if (!isSpare(frame)) return;
    const leave = frame.shots[0]?.pins_standing;
    if (!leave || leave.length === 0) return;
    try {
      const existing = await getSpareLineByPins(leave);
      if (existing?.line) return;
      setPendingSpareLeave({
        pins: [...leave].sort((a, b) => a - b) as PinNumber[],
        notes: existing?.notes
      });
    } catch {
      // best-effort; skip the offer on lookup failure
    }
  }

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submittedFrameNumber = gameState.currentFrameNumber;
    const submission = submitShot(gameState, standing);
    setGameState(submission.state);
    const frameToPersist =
      submission.savedFrame ??
      submission.state.frames.find((f) => f.frame_number === submittedFrameNumber) ??
      null;
    if (submission.savedFrame) void offerSpareLine(submission.savedFrame);
    if (!frameToPersist) return;
    try {
      await onFrameComplete?.(frameToPersist);
      if (submission.state.isComplete) await onGameComplete?.(submission.state.frames);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
    setSelectedShot(null);
    setErrorMessage("");
    lastDefaultedShot.current = null;
  }

  function selectShot(frameNumber: number, shotIndex: number) {
    setSelectedShot({ frameNumber, shotIndex });
  }

  function goLive() {
    setSelectedShot(null);
  }

  const viewedLane = selectedShot && game ? laneForFrame(game, selectedShot.frameNumber) : undefined;

  const highlightCell = selectedShot
    ? { frameNumber: selectedShot.frameNumber, shotIndex: selectedShot.shotIndex }
    : { frameNumber: gameState.currentFrameNumber, shotIndex: gameState.currentShot - 1 };

  // Provisional symbol for the in-progress (live) shot, shown in the scorecard
  // and updated as the user taps the pin deck. A fresh rack counts knocked-down
  // pins (X on a clean sweep); a partial leave counts cleared pins (/ on a spare).
  const liveSymbol = (() => {
    if (isEditing || gameState.isComplete) return undefined;
    const avail = gameState.availablePins;
    const standing = gameState.standingPins;
    const fresh = avail.length === 10;
    // Stay blank until the user taps the deck for this shot. The default (no tap)
    // is all pins standing-up on a fresh rack and all pins up on a partial leave.
    const interacted = fresh ? standing.length > 0 : standing.length < avail.length;
    if (!interacted) return undefined;
    const knocked = fresh ? 10 - standing.length : avail.length - standing.length;
    if (fresh) return knocked === 0 ? "-" : String(knocked);
    return knocked === avail.length ? "/" : knocked === 0 ? "-" : String(knocked);
  })();

  // Flush the live (un-submitted) shot when the game changes or the component
  // unmounts — and on page-hide / tab background. The ref is refreshed in a
  // post-commit effect (not during render) so the gameKey cleanup below — which
  // runs BEFORE the next render's effects — reads the OUTGOING game's state
  // paired with its matching onFrameComplete. Assigning during render would pair
  // the outgoing game's shot with the incoming game's handler (writes to the
  // wrong game).
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      if (selectedShot !== null || gameState.isComplete) return;
      // Skip a fresh rack with no interaction (ambiguous: strike vs un-bowled).
      if (gameState.availablePins.length === 10 && liveSymbol === undefined) return;
      const hasInput =
        liveSymbol !== undefined ||
        selectedBallId != null ||
        intendedLine != null ||
        actualLine != null ||
        shotNotes.trim() !== "";
      if (!hasInput) return;
      const frame = buildLiveFrame(gameState);
      if (frame) void onFrameComplete?.(frame);
    };
  });

  useEffect(() => {
    return () => { flushRef.current(); };
  }, [gameKey]);

  useEffect(() => {
    const onHide = () => flushRef.current();
    window.addEventListener("pagehide", onHide);
    const onVis = () => { if (document.hidden) flushRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Once the live shot has a value, fold it into the scoring frames so a prior
  // pending strike/spare resolves and shows its total — even though the current
  // frame itself stays blank until it is settled.
  const scoreFrames = (() => {
    if (liveSymbol === undefined) return gameState.frames;
    const fn = gameState.currentFrameNumber;
    const shotIdx = gameState.currentShot - 1;
    const existing = gameState.frames.find((f) => f.frame_number === fn);
    const baseShots = existing ? existing.shots.slice(0, shotIdx) : [];
    const provisional: Frame = {
      game_id: existing?.game_id ?? 0,
      frame_number: fn,
      shots: [...baseShots, { pins_standing: gameState.standingPins }],
      is_strike: false,
      is_spare: false
    };
    return [...gameState.frames.filter((f) => f.frame_number !== fn), provisional].sort(
      (a, b) => a.frame_number - b.frame_number
    );
  })();

  const detailKey = isEditing && selectedShot
    ? `r-${selectedShot.frameNumber}-${selectedShot.shotIndex}`
    : `live-${gameState.currentFrameNumber}-${gameState.currentShot}`;

  // Leave the viewed shot faces: live entry uses the current available pins;
  // editing derives from the pins entering the selected shot. Fresh rack ⇒ none.
  const shownLeave = (() => {
    if (isEditing && recordedFrame && selectedShot) {
      const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
      return avail && avail.length < 10 ? avail : undefined;
    }
    return gameState.availablePins.length < 10 ? gameState.availablePins : undefined;
  })();

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      {mode === "standalone" && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={newGame}>
            New
          </Button>
          <p className="text-2xl font-extrabold leading-none text-accent">{gameScore.total}</p>
        </div>
      )}

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
        gameComplete={gameState.isComplete}
        highlightCell={highlightCell}
        liveSymbol={liveSymbol}
        scoreFrames={scoreFrames}
        onShotTap={selectShot}
        onLiveTap={gameState.isComplete ? undefined : goLive}
      />

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          {(onEditLanes || lanesList.length > 0) && (
            <div className="flex items-center justify-between rounded-lg border border-edge bg-surface px-2.5 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Lane</span>
              {onEditLanes ? (
                <button
                  type="button"
                  onClick={() => { if (requestEdit()) onEditLanes(); }}
                  aria-label="Edit game lanes"
                  className={`relative inline-flex items-center gap-1 ${TAP_TARGET_44}`}
                >
                  {lanesList.length > 0 ? (
                    lanesList.map((l) => (
                      <span
                        key={l}
                        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${
                          l === (isEditing ? viewedLane : currentLane) ? "bg-felt-700 text-white" : "bg-surface-muted text-ink-secondary"
                        }`}
                      >
                        {l}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-accent">+ Set lanes</span>
                  )}
                </button>
              ) : (
                <span className="text-sm font-bold text-ink">{lanesList.join(" / ")}</span>
              )}
            </div>
          )}

          <PinGrid
            standingPins={isEditing && recordedShot ? recordedShot.pins_standing : gameState.standingPins}
            availablePins={
              isEditing && recordedFrame && selectedShot
                ? availableEnteringShot(recordedFrame, selectedShot.shotIndex)
                : gameState.availablePins
            }
            onChange={(pins) => {
              if (!requestEdit()) return;
              if (isEditing) handleEditPins(pins);
              else updateStandingPins(pins);
            }}
            size="sm"
          />

          {/* Strike/Spare + Next stay visible and functional in both live and
              editing states (every frame is editable). While editing a recorded
              shot, Strike/Spare applies that mark and Next leaves it untouched —
              both then jump the cursor back to the latest incomplete frame. */}
          {!gameState.isComplete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    handleEditPins([]);
                    goLive();
                  } else {
                    void recordShot([]);
                  }
                }}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
              >
                {editStrikeOrSpareLabel}
              </button>
              <button
                type="button"
                onClick={() => (isEditing ? goLive() : void recordShot())}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-felt-700 bg-surface text-sm font-semibold text-accent hover:bg-felt-50"
              >
                Next
              </button>
            </div>
          ) : null}

          {pendingSpareLeave && (
            <div className="flex items-center gap-2 rounded-lg border border-felt-700 bg-felt-50 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowSpareLineDialog(true)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-accent"
              >
                + Save spare line for {formatLeavePins(pendingSpareLeave.pins)}
              </button>
              <IconButton
                label="Dismiss"
                onClick={() => setPendingSpareLeave(null)}
                className="shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </div>

        <ShotDetailBar
          key={detailKey}
          balls={balls}
          ballId={isEditing && recordedShot ? recordedShot.ball_id : selectedBallId}
          onBallChange={isEditing ? (id) => handleEditMeta({ ball_id: id }) : setSelectedBallId}
          intended={isEditing && recordedShot ? recordedShot.intended : intendedLine}
          onIntendedChange={isEditing ? (l) => handleEditMeta({ intended: l }) : setIntendedLine}
          actual={isEditing && recordedShot ? recordedShot.actual : actualLine}
          onActualChange={isEditing ? (l) => handleEditMeta({ actual: l }) : setActualLine}
          notes={isEditing && recordedShot ? recordedShot.notes ?? "" : shotNotes}
          spareLeave={shownLeave}
          onEditAttempt={requestEdit}
          editPromptOpen={showEditPrompt}
          onNotesChange={
            // Store raw while typing (keeps internal/trailing spaces); the
            // textarea's onBlur trims on save. Trimming per-keystroke here made
            // it impossible to type a space in a recorded shot's notes.
            isEditing ? (n) => handleEditMeta({ notes: n }) : setShotNotes
          }
          onOpenArsenal={onOpenArsenal}
        />
      </div>

      {errorMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-red-600">{errorMessage}</p>
      )}

      <ConfirmDialog
        open={showEditPrompt}
        title="Edit this completed game?"
        message="This game is finished. Changing a recorded shot can't be undone."
        confirmLabel="Edit"
        onConfirm={() => {
          setUnlocked(true);
          setShowEditPrompt(false);
        }}
        onCancel={() => setShowEditPrompt(false)}
      />

      {showSpareLineDialog && pendingSpareLeave && (
        <SpareLineFormDialog
          key={pendingSpareLeave.pins.join("-")}
          initialPins={pendingSpareLeave.pins}
          lockPins
          initialNotes={pendingSpareLeave.notes}
          onSaved={() => {
            setShowSpareLineDialog(false);
            setPendingSpareLeave(null);
          }}
          onCancel={() => setShowSpareLineDialog(false)}
        />
      )}
    </section>
  );
}
