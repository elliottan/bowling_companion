import { Check, ChevronLeft, ChevronRight, Crosshair, Eye, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ErrorBanner } from "./ErrorBanner";
import { PinGrid } from "./PinGrid";
import { LaneVisualizerLazy } from "./LaneVisualizerLazy";
import { SpareLinePickerSheet } from "./SpareLinePickerSheet";
import { useDriftModel } from "../lib/driftModelContext";
import { deriveLaydown, deriveSlide, syncStanceLaydown } from "../lib/driftModel";
import { useHandedness } from "../lib/handednessContext";
import { formatLeave } from "../lib/pins";
import type { LeaveStats } from "../lib/stats";
import { upsertSpareLine } from "../services/ballRepository";
import type { LineSpec, PinNumber, SpareLine } from "../types/bowling";
import { Button } from "./ui/Button";
import { FIELD_DENSE, FIELD_MICRO_LABEL as floatLabel } from "./ui/field";
import { IconButton } from "./ui/IconButton";
import { FormSheet } from "./ui/FormSheet";

const EMPTY_LINE: LineSpec = {};
const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Field chrome mirrors the score-entry shot panel (ActiveGameScorer's LineInput)
// so a spare line reads the same way a shot does.

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";
const boardInput = `${FIELD_DENSE} px-1 text-center font-semibold tabular-nums`;

interface SpareLineFormDialogProps {
  /** Leave being shot at (standing pins). Empty = user picks pins. */
  initialPins: PinNumber[];
  /** Lock the pin grid (editing an existing leave / a known live leave). */
  lockPins: boolean;
  initialLine?: LineSpec;
  initialStrikeOffset?: SpareLine["strike_offset"];
  /** Carried through a save untouched. The field is off the sheet for now,
   *  and a save must not wipe a note written before it was taken off. */
  initialNotes?: string;
  /** Opens reading rather than editing, with a pencil to start editing. A save
   *  from there goes back to reading instead of closing. */
  startInView?: boolean;
  /** How the leave has gone, so the sheet can show it beside the deck. Looked
   *  up by the pins on the deck; omitted, the deck takes the whole row. */
  leaves?: LeaveStats[];
  /** Other leaves' saved lines, offered to borrow from while editing. */
  spareLines?: SpareLine[];
  onSaved: () => void;
  onCancel: () => void;
  /** When provided, shows a Delete button (edit context only). The caller owns
   *  the confirm, and says it is open through `covered`. */
  onDelete?: () => void;
  /** A dialog the caller opened is on top of this sheet. */
  covered?: boolean;
  /** A failure from something the caller ran for this sheet (the delete). */
  error?: string;
}

/**
 * A spare line: the leave, how it has gone, and the line for it. Mounts fresh
 * per open, callers give it a `key` (e.g. the editing id or leave) so internal
 * state resets. Used by the spare lines screen and Stats, which open it to read
 * (`startInView`), and by the live scorer when capturing a just-converted spare.
 */
export function SpareLineFormDialog({
  initialPins,
  lockPins,
  initialLine,
  initialStrikeOffset,
  initialNotes,
  startInView = false,
  leaves,
  spareLines,
  onSaved,
  onCancel,
  onDelete,
  covered = false,
  error: callerError
}: SpareLineFormDialogProps) {
  const [pins, setPins] = useState<PinNumber[]>(initialPins);
  const [line, setLine] = useState<LineSpec>(initialLine ?? EMPTY_LINE);
  // Held as text so a lone "-" survives while the number after it is typed.
  const [move, setMove] = useState({
    stance: initialStrikeOffset?.stance?.toString() ?? "",
    target: initialStrikeOffset?.target?.toString() ?? ""
  });
  const [editing, setEditing] = useState(!startInView);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showViz, setShowViz] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const driftModel = useDriftModel();

  const applyLine = (next: LineSpec) => setLine(syncStanceLaydown(line, next, driftModel));

  const derivedSlide = line.stance != null ? deriveSlide(line.stance, driftModel) : undefined;
  const derivedLaydown =
    line.laydown ?? (line.stance != null ? deriveLaydown(line.stance, driftModel) : undefined);

  // Lines worth borrowing: another leave's, with a board on it.
  const key = [...pins].sort((a, b) => a - b).join("-");
  const borrowable = (spareLines ?? []).filter(
    (sl) =>
      sl.pins.join("-") !== key && (sl.line?.stance != null || sl.line?.target != null)
  );

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!editing) return;
    if (pins.length === 0) {
      setError("Select at least one pin for this leave.");
      return;
    }

    // Store the spec whole, the hook timing set in the visualizer lives on the
    // same object, and picking fields off it here would quietly drop it.
    const spec: LineSpec | undefined =
      Object.values(line).some((v) => v != null) ? line : undefined;

    const moved = {
      ...(move.stance.trim() !== "" &&
        Number.isFinite(Number(move.stance)) && { stance: Number(move.stance) }),
      ...(move.target.trim() !== "" &&
        Number.isFinite(Number(move.target)) && { target: Number(move.target) })
    };

    setIsSaving(true);
    setError("");
    try {
      await upsertSpareLine(
        pins,
        spec,
        initialNotes,
        Object.keys(moved).length ? moved : undefined
      );
      if (startInView) setEditing(false);
      else onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save spare line.");
    } finally {
      setIsSaving(false);
    }
  }

  // The bar's trailing control is the mode: a pencil while reading, which
  // turns into the tick that saves while editing.
  const trailing = editing ? (
    <IconButton
      variant="confirm"
      onClick={() => void handleSubmit()}
      disabled={isSaving}
      label="Save spare line"
    >
      <Check size={20} aria-hidden="true" />
    </IconButton>
  ) : (
    <IconButton variant="round" onClick={() => setEditing(true)} label="Edit spare line">
      <Pencil size={18} aria-hidden="true" />
    </IconButton>
  );

  const stats = leaves && pins.length > 0 ? leaves.find((l) => l.pins.join("-") === key) : undefined;

  return (
    <FormSheet
      title={pins.length === 0 ? "Add spare line" : formatLeave(pins)}
      onClose={onCancel}
      trailing={trailing}
      active={!showViz && !showPicker && !covered}
      banner={
        error || callerError ? <ErrorBanner>{error || callerError}</ErrorBanner> : undefined
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          {editing && !lockPins && (
            <p className="mb-2 text-xs text-ink-secondary">Tap the pins left standing.</p>
          )}
          {/* The deck does not need the whole width, so the record of the
              leave sits beside it rather than under the fold. */}
          {leaves ? (
            <div className="flex items-center gap-3">
              <div className="w-[11.5rem] shrink-0">
                <PinGrid
                  standingPins={pins}
                  availablePins={ALL_PINS}
                  onChange={setPins}
                  readOnly={lockPins || !editing}
                  size="sm"
                />
              </div>
              <LeaveRecord stats={stats} empty={pins.length === 0} />
            </div>
          ) : (
            <PinGrid
              standingPins={pins}
              availablePins={ALL_PINS}
              onChange={setPins}
              readOnly={lockPins || !editing}
            />
          )}
        </div>

        <div>
          {/* The eye sits in the heading row, as on the scorer's line. */}
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className={eyebrow}>Shooting line</span>
            <div className="flex items-center gap-1">
              {editing && borrowable.length > 0 && (
                <IconButton
                  compact
                  label="Use another leave's line"
                  title="Copy a saved spare line onto this leave"
                  onClick={() => setShowPicker(true)}
                >
                  <Crosshair size={14} aria-hidden="true" />
                </IconButton>
              )}
              <IconButton
                compact
                label="View line on the lane"
                title="View the line on the lane"
                onClick={() => setShowViz(true)}
              >
                <Eye size={14} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {([["stance", "Stance"], ["target", "Target"]] as const).map(([field, label]) => (
              <label key={field} className="min-w-0 flex-1">
                <span className={floatLabel}>{label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  readOnly={!editing}
                  placeholder={editing ? undefined : "-"}
                  value={line[field] ?? ""}
                  onChange={(e) =>
                    applyLine({
                      ...line,
                      [field]: e.target.value === "" ? undefined : Number(e.target.value)
                    })
                  }
                  className={boardInput}
                />
              </label>
            ))}
          </div>
          {(derivedSlide != null || derivedLaydown != null) && (
            <button
              type="button"
              onClick={() => setShowViz(true)}
              title="Derived from your stance. Tap to see it on the lane."
              className="mt-1 flex w-full flex-wrap items-center gap-x-1 text-left text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary tabular-nums active:text-accent"
            >
              {derivedSlide != null && <span className="whitespace-nowrap">Slide {derivedSlide}</span>}
              {derivedSlide != null && derivedLaydown != null && (
                <span aria-hidden="true" className="text-ink-tertiary">→</span>
              )}
              {derivedLaydown != null && (
                <span className="whitespace-nowrap">Laydown {derivedLaydown}</span>
              )}
            </button>
          )}
        </div>

        {/* The strike-ball answer to the same leave, stored as a move rather
            than boards: "two right of wherever I am playing" survives the
            lane changing under you, and follows you across strike balls.
            ADR-053. */}
        <div>
          <p className={`mb-0.5 ${eyebrow}`}>Strike ball move</p>
          <div className="flex items-center gap-1.5">
            {(["stance", "target"] as const).map((field) => (
              <MoveStepper
                key={field}
                label={field}
                value={move[field]}
                readOnly={!editing}
                onChange={(next) => setMove((m) => ({ ...m, [field]: next }))}
              />
            ))}
          </div>
        </div>

        {/* Delete lives at the foot of the body as a danger-ghost button: the
            sheet's bar carries the commit, and a destructive action never
            shares that slot (DESIGN-LANGUAGE §1). The caller confirms it. */}
        {onDelete && (
          <Button
            variant="danger-ghost"
            onClick={onDelete}
            disabled={isSaving}
            aria-label={`Delete spare line for pins ${pins.join(", ")}`}
            className="w-full"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete spare line
          </Button>
        )}

        {/* Enables the keyboard's Go/Return to submit without a visible row. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>

      {showViz && (
        <LaneVisualizerLazy
          title="Spare line"
          line={line}
          leave={pins}
          spare
          // Reading, the lane only shows the line: changes there are edits,
          // and edits start at the pencil.
          onChange={editing ? (l) => applyLine(l ?? {}) : undefined}
          onClose={() => setShowViz(false)}
        />
      )}

      {/* A copy, not a link: the boards land in the fields, and from then on
          this leave's line is its own to change. Portalled so the sheet's own
          panel, which moves on a transform while dragged, is not its frame. */}
      {showPicker &&
        createPortal(
          <SpareLinePickerSheet
            spareLines={borrowable}
            onPick={(picked) => {
              applyLine({ ...line, ...picked });
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />,
          document.body
        )}
    </FormSheet>
  );
}

/** How the leave has gone: the rate, made over chances, and how often it was
 *  left. The same numbers as its cell on Stats. */
function LeaveRecord({ stats, empty }: { stats?: LeaveStats; empty: boolean }) {
  if (empty) return null;
  if (!stats) {
    return <p className="min-w-0 flex-1 text-xs text-ink-secondary">Not left in a recorded game yet.</p>;
  }
  return (
    <dl className="min-w-0 flex-1 space-y-2">
      <div>
        <dt className={eyebrow}>Converted</dt>
        <dd
          className={`text-2xl font-bold leading-tight tabular-nums ${
            stats.conversionPct !== null && stats.conversionPct >= 70 ? "text-accent" : "text-ink"
          }`}
        >
          {stats.conversionPct !== null ? `${stats.conversionPct}%` : "-"}
        </dd>
      </div>
      <div>
        <dt className={eyebrow}>Made</dt>
        <dd className="text-sm font-semibold tabular-nums text-ink">
          {stats.conversions}/{stats.chances}
        </dd>
      </div>
      <div>
        <dt className={eyebrow}>Left</dt>
        <dd className="text-sm font-semibold tabular-nums text-ink">
          {stats.attempts} {stats.attempts === 1 ? "time" : "times"}
        </dd>
      </div>
    </dl>
  );
}

/** How far one tap of an arrow moves the strike ball. Half a board, because a
 *  spare move is read off the same boards a shooting line is and half of one is
 *  the smallest move a bowler actually makes. */
const MOVE_STEP = 0.5;
/** Past this the move is not a move, it is a different line. */
const MOVE_LIMIT = 20;

/**
 * A strike-ball move field with arrows either side of it.
 *
 * The move is signed, and a phone's numeric keyboard has no minus key, so the
 * field on its own could only ever be given a move to the right. The arrows are
 * the way in to the other half of the range, not a convenience: they step half
 * a board each, through zero, in both directions. The box still takes typing
 * (kept as text, so a lone "-" survives while the digits after it are typed)
 * for anyone who has a minus key.
 *
 * The arrows point the way the move goes on screen, as the scorer's do: up the
 * boards is screen-left for a right-hander and screen-right for a left-hander.
 */
function MoveStepper({
  label,
  value,
  readOnly,
  onChange
}: {
  label: string;
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const handedness = useHandedness();
  const leftIsUp = handedness === "right";
  const nudge = (delta: number) => {
    const current = value.trim() === "" || !Number.isFinite(Number(value)) ? 0 : Number(value);
    const next = Math.min(MOVE_LIMIT, Math.max(-MOVE_LIMIT, current + delta));
    // Rounded to the step, so a typed 0.3 lands on the grid the arrows walk.
    onChange(String(Math.round(next / MOVE_STEP) * MOVE_STEP));
  };

  const arrow = (side: "left" | "right") => {
    const up = (side === "left") === leftIsUp;
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        aria-label={`${label} move ${up ? "up" : "down"} half a board`}
        onClick={() => nudge(up ? MOVE_STEP : -MOVE_STEP)}
        className="flex w-8 shrink-0 items-center justify-center text-ink-strong active:bg-edge"
      >
        <Icon size={14} strokeWidth={3} aria-hidden="true" />
      </button>
    );
  };

  return (
    <label className="min-w-0 flex-1">
      <span className={floatLabel}>{label}</span>
      <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-edge-strong bg-surface-muted focus-within:border-accent-fill focus-within:bg-surface">
        {!readOnly && arrow("left")}
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} move`}
          placeholder={readOnly ? "-" : "0"}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-0.5 text-center text-sm font-semibold tabular-nums text-ink placeholder:text-ink-tertiary outline-none"
        />
        {!readOnly && arrow("right")}
      </div>
    </label>
  );
}
