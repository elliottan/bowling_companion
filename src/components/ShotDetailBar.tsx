/**
 * Everything recorded about a single shot beyond its pins: the ball, the
 * Intended and Actual lines (each a LineInput, each openable on the lane), and
 * the note. Owns the drift-model conversions that keep stance, slide and
 * laydown in step (ADR-030, ADR-032).
 */
import { Eye, Plus } from "lucide-react";
import { useState } from "react";
import { useDriftModel } from "../lib/driftModelContext";
import { useHandedness } from "../lib/handednessContext";
import {
  deriveLaydown,
  deriveLaydownFromSlide,
  deriveSlide,
  deriveSlideFromLaydown,
  deriveStanceFromLaydown
} from "../lib/driftModel";
import { derivedApexForDisplay } from "../lib/laneGeometry";
import type { Ball, LineSpec, PinNumber } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { BallPickerSheet } from "./BallPickerSheet";
import { CatalogBallImage } from "./CatalogBallImage";
import { LaneVisualizerLazy } from "./LaneVisualizerLazy";
import { LineInput, floatLabel, lockedTapBlocker } from "./LineInput";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

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
export function ShotDetailBar({
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
  // A breakpoint is a straight-ball concept, not a spare-shot one (ADR-035
  // amends ADR-031): shooting a leave with a hooking ball has a real apex, and
  // the lane view already draws it. Only a plastic spare ball — aimed at the pin
  // rather than at a board down the lane — has no breakpoint to read.
  const hidesBreakpoint = isSpareAttempt && !!selectedBall?.is_spare_ball;

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

  const apexFor = (line: LineSpec | undefined, laydown: number | undefined) =>
    hidesBreakpoint || !line
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
            aria-label={`Ball: ${selectedBall?.name ?? "none"}. Tap to change`}
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
                <span className="ml-1.5 rounded-full border border-edge-strong px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-secondary">
                  Spare
                </span>
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
        <LaneVisualizerLazy
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
        <label className="block">
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
            className="w-full resize-none overflow-y-auto rounded-lg border border-edge-strong bg-surface-muted px-2 pb-1 pt-1.5 text-[11px] leading-snug text-ink placeholder:text-ink-tertiary focus:border-accent-fill focus:bg-surface focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}
