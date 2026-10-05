import { MiniPins } from "./MiniPins";
import { FormSheet } from "./ui/FormSheet";
import { EmptyState } from "./ui/EmptyState";
import { Crosshair } from "lucide-react";
import { useHandedness } from "../lib/handednessContext";
import { describeMove, hasLine, hasMove } from "../lib/spareLines";
import type { LineSpec, SpareLine } from "../types/bowling";

interface SpareLinePickerSheetProps {
  spareLines: SpareLine[];
  /** The boards, and with `withMoves` the leave's strike-ball move as well. */
  onPick: (line: LineSpec, strikeOffset?: SpareLine["strike_offset"]) => void;
  onClose: () => void;
  /** Offer leaves answered by a strike-ball move too, and hand the move over.
   *  On the spare line sheet, where a move is part of what a leave stores. The
   *  scorer leaves it off: a move needs a strike line to move off, and the box
   *  there takes boards. */
  withMoves?: boolean;
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
export function SpareLinePickerSheet({ spareLines, onPick, onClose, withMoves = false }: SpareLinePickerSheetProps) {
  const handedness = useHandedness();
  // Only the two boards travel, matching every other path a saved spare line
  // takes: the rest of the spec belongs to the shot it was recorded from.
  const offered = spareLines.filter((sl) => hasLine(sl) || (withMoves && hasMove(sl)));
  const move = (n: number | undefined) => (n ? describeMove(n, handedness) : "-");

  return (
    <FormSheet title="Use another leave's line" onClose={onClose}>
      {offered.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No lines saved yet"
          description="Save a line for one leave and you can borrow it for another."
        />
      ) : (
        <ul className={`grid gap-1.5 ${withMoves ? "grid-cols-3" : "grid-cols-4"}`}>
          {offered.map((sl) => (
            <li key={sl.id} className="flex">
              <button
                type="button"
                onClick={() =>
                  onPick(
                    {
                      ...(sl.line?.stance != null && { stance: sl.line.stance }),
                      ...(sl.line?.target != null && { target: sl.line.target })
                    },
                    withMoves && hasMove(sl) ? sl.strike_offset : undefined
                  )
                }
                aria-label={`Use the line for pins ${sl.pins.join(", ")}`}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm active:opacity-70"
              >
                <MiniPins standing={sl.pins} size="sm" />
                {hasLine(sl) && (
                  <span className="text-[11px] font-bold tabular-nums text-ink">
                    {sl.line?.stance ?? "-"}
                    <span className="text-ink-tertiary"> / </span>
                    {sl.line?.target ?? "-"}
                  </span>
                )}
                {withMoves && hasMove(sl) && (
                  <span className="text-[10px] font-semibold leading-tight tabular-nums text-accent">
                    Strike ball
                    <br />
                    {move(sl.strike_offset?.stance)}
                    <span className="text-ink-tertiary"> / </span>
                    {move(sl.strike_offset?.target)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </FormSheet>
  );
}
