import { MiniPins } from "./MiniPins";
import { FormSheet } from "./ui/FormSheet";
import { EmptyState } from "./ui/EmptyState";
import { Crosshair } from "lucide-react";
import type { LineSpec, SpareLine } from "../types/bowling";

interface SpareLinePickerSheetProps {
  spareLines: SpareLine[];
  onPick: (line: LineSpec) => void;
  onClose: () => void;
}

/**
 * Borrow another leave's line for the shot in front of you. Some leaves are the
 * same shot: a 6 and a 6-10 are thrown at the same pin, and a bowler who has
 * written down one already knows the answer to the other.
 *
 * It only fills the box. Whether the line becomes this leave's saved answer is
 * decided after the shot, by the prompt, once you know whether it worked
 * (ADR-054).
 */
export function SpareLinePickerSheet({ spareLines, onPick, onClose }: SpareLinePickerSheetProps) {
  // Only the two boards travel, matching every other path a saved spare line
  // takes: the rest of the spec belongs to the shot it was recorded from.
  const withLines = spareLines.filter((sl) => sl.line?.stance != null || sl.line?.target != null);

  return (
    <FormSheet title="Use another leave's line" onClose={onClose}>
      {withLines.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No lines saved yet"
          description="Save a line for one leave and you can borrow it for another."
        />
      ) : (
        <ul className="grid grid-cols-4 gap-1.5">
          {withLines.map((sl) => (
            <li key={sl.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({
                    ...(sl.line?.stance != null && { stance: sl.line.stance }),
                    ...(sl.line?.target != null && { target: sl.line.target })
                  })
                }
                aria-label={`Use the line for pins ${sl.pins.join(", ")}`}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm active:opacity-70"
              >
                <MiniPins standing={sl.pins} size="sm" />
                <span className="text-[11px] font-bold tabular-nums text-ink">
                  {sl.line?.stance ?? "-"}
                  <span className="text-ink-tertiary"> / </span>
                  {sl.line?.target ?? "-"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </FormSheet>
  );
}
