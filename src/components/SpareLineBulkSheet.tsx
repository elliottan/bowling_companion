import { plural, t } from "@lingui/core/macro";
import { Check } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "./ErrorBanner";
import { MiniPins } from "./MiniPins";
import { MoveStepper } from "./SpareLineFormDialog";
import { useDriftModel } from "../lib/driftModelContext";
import { deriveLaydown, deriveSlide, syncStanceLaydown } from "../lib/driftModel";
import { formatNumber } from "../lib/format";
import { formatLeave } from "../lib/pins";
import type { LineRow } from "../lib/spareLines";
import { updateSpareLines } from "../services/ballRepository";
import type { LineSpec, SpareLine } from "../types/bowling";
import { FIELD_DENSE, FIELD_MICRO_LABEL as floatLabel } from "./ui/field";
import { FormSheet } from "./ui/FormSheet";
import { IconButton } from "./ui/IconButton";

const eyebrow = "text-caption-2 font-semibold uppercase tracking-[0.01em] text-ink-secondary";
const boardInput = `${FIELD_DENSE} px-1 text-center font-semibold tabular-nums`;

/** A board typed as text, or nothing when the field is empty or not a number. */
function board(text: string): number | undefined {
  return text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : undefined;
}

/**
 * One line, or one strike ball move, changed for every leave on its row of the
 * Spare lines screen (ADR-140). Opened from the row's heading.
 *
 * The leaves are shown and cannot be changed here: the row is the set being
 * edited, and the single leave's own sheet is where pins are picked. Saving
 * writes the new boards (or move) onto each leave and leaves everything else on
 * it alone, so a leave that also has a strike ball move keeps it, and the other
 * way round.
 */
export function SpareLineBulkSheet({ row, onClose }: { row: LineRow; onClose: () => void }) {
  const driftModel = useDriftModel();
  const kind = row.kind === "move" ? "move" : "line";
  const from = row.line;
  const [stance, setStance] = useState(from?.line?.stance?.toString() ?? "");
  const [target, setTarget] = useState(from?.line?.target?.toString() ?? "");
  const [move, setMove] = useState({
    stance: from?.strike_offset?.stance?.toString() ?? "",
    target: from?.strike_offset?.target?.toString() ?? ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const leaves = row.tiles.map((tile) => tile.spareLine);

  const stanceBoard = board(stance);
  const slide = stanceBoard != null ? deriveSlide(stanceBoard, driftModel) : undefined;
  const laydown = stanceBoard != null ? deriveLaydown(stanceBoard, driftModel) : undefined;

  /** This leave with the row's new answer on it, and the rest of it as it was. */
  function nextFor(sl: SpareLine): Pick<SpareLine, "line" | "strike_offset"> {
    if (kind === "move") {
      const moved = {
        ...(board(move.stance) ? { stance: board(move.stance) } : {}),
        ...(board(move.target) ? { target: board(move.target) } : {})
      };
      return { line: sl.line, strike_offset: Object.keys(moved).length ? moved : undefined };
    }
    const prev = sl.line ?? {};
    // The laydown follows the stance as it does on a single leave's sheet.
    const next: LineSpec = syncStanceLaydown(
      prev,
      { ...prev, stance: board(stance), target: board(target) },
      driftModel
    );
    if (next.stance == null) delete next.laydown;
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v != null)) as LineSpec;
    return {
      line: kept.stance != null || kept.target != null ? kept : undefined,
      strike_offset: sl.strike_offset
    };
  }

  async function save() {
    setIsSaving(true);
    setError("");
    try {
      await updateSpareLines(
        leaves.flatMap((sl) => (sl.id != null ? [sl.id] : [])),
        nextFor
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to save the spare lines.`);
      setIsSaving(false);
    }
  }

  return (
    <FormSheet
      title={t`Bulk edit`}
      subtitle={
        kind === "move"
          ? plural(leaves.length, {
              one: "Strike ball move for # leave",
              other: "Strike ball move for # leaves"
            })
          : plural(leaves.length, {
              one: "Spare ball line for # leave",
              other: "Spare ball line for # leaves"
            })
      }
      onClose={onClose}
      size="tall"
      trailing={
        <IconButton
          variant="confirm"
          onClick={() => void save()}
          disabled={isSaving}
          label={plural(leaves.length, { one: "Save for all # leave", other: "Save for all # leaves" })}
        >
          <Check size={20} aria-hidden="true" />
        </IconButton>
      }
      banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {kind === "line" ? (
          <div>
            <p className={`mb-0.5 ${eyebrow}`}>{t`Spare ball line`}</p>
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["stance", t({ message: "Stance", comment: "Bowling term: the board the bowler stands on at the foul line." }), stance, setStance],
                  ["target", t({ message: "Target", comment: "Bowling term: the board the ball crosses at the arrows." }), target, setTarget]
                ] as const
              ).map(([field, label, value, set]) => (
                <label key={field} className="min-w-0 flex-1">
                  <span className={floatLabel}>{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className={boardInput}
                  />
                </label>
              ))}
            </div>
            {(slide != null || laydown != null) && (
              <p className="mt-1 text-caption-2 font-semibold uppercase tracking-[0.01em] text-ink-secondary tabular-nums">
                {slide != null && t`Slide ${{ board: formatNumber(slide, 2) }}`}
                {slide != null && laydown != null && (
                  <span aria-hidden="true" className="text-ink-tertiary"> → </span>
                )}
                {laydown != null && t`Laydown ${{ board: formatNumber(laydown, 2) }}`}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className={`mb-0.5 ${eyebrow}`}>{t`Strike ball move`}</p>
            <div className="flex items-center gap-1.5">
              {(["stance", "target"] as const).map((field) => (
                <MoveStepper
                  key={field}
                  label={
                    field === "stance"
                      ? t({ message: "stance", comment: "Bowling term: the board the bowler stands on at the foul line. Lower case, a field name." })
                      : t({ message: "target", comment: "Bowling term: the board the ball crosses at the arrows. Lower case, a field name." })
                  }
                  value={move[field]}
                  readOnly={false}
                  onChange={(next) => setMove((m) => ({ ...m, [field]: next }))}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className={`mb-1.5 ${eyebrow}`}>{t`Changes every one of these`}</p>
          <ul aria-label={t`Leaves on this line`} className="grid grid-cols-3 gap-1.5">
            {leaves.map((sl) => (
              <li
                key={sl.id ?? sl.pins.join("-")}
                className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm"
              >
                <MiniPins standing={sl.pins} size="sm" />
                <span className="text-caption-2 font-semibold tabular-nums text-ink">{formatLeave(sl.pins)}</span>
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </FormSheet>
  );
}
