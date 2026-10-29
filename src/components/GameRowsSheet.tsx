import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatShortDate } from "../lib/dates";
import { laneLabel } from "./SessionHeaderText";
import { FormSheet } from "./ui/FormSheet";
import { LIST_DIVIDER } from "./ui/ListGroup";

/** What every row in a games sheet says about its night. */
export interface GameRow {
  sessionId: number;
  gameId: number;
  alley: string;
  date: string;
  event?: string;
  lanes: string[];
  oilPattern?: string;
}

/**
 * The games behind one figure on Stats, as a sheet: a ball's game column
 * (`BallGameSessionsDialog`) or a point on the by-game chart
 * (`GameSlotSessionsDialog`). Each row is a night and goes to the game it
 * counted.
 *
 * A sheet like every other list the app opens over a screen, with the close
 * in its bar and the rows as an inset grouped list (ADR-191, ADR-197). It was a
 * card centred over the screen with no bar and no way out but a tap beside it,
 * and its rates sat in tinted pills nothing else in the app draws.
 *
 * Portalled to the body: the stats pane slides on a CSS transform, and a
 * transformed ancestor makes `fixed` resolve against it rather than the
 * viewport. Last in the body, it sits over the All balls sheet it opens from.
 */
export function GameRowsSheet<T extends GameRow>({
  title,
  subtitle,
  rows,
  detail,
  onSelect,
  onClose
}: {
  title: string;
  subtitle: string;
  rows: T[];
  /** The row's own figures, under its night. */
  detail: (row: T) => ReactNode;
  onSelect: (sessionId: number, gameId: number) => void;
  onClose: () => void;
}) {
  return createPortal(
    <FormSheet title={title} subtitle={subtitle} onClose={onClose}>
      <ul className="overflow-hidden rounded-[26px] bg-surface-muted">
        {rows.map((row) => (
          <li key={row.gameId} className={LIST_DIVIDER}>
            <button
              type="button"
              // Closed first, then the game opened, in one step: handing the
              // selection over alone left the sheet open in the caller's state,
              // and it came straight back over the game it had just opened.
              onClick={() => {
                onClose();
                onSelect(row.sessionId, row.gameId);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-edge/40"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-subhead font-semibold text-ink">{row.alley}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-secondary">
                    {formatShortDate(row.date)}
                  </span>
                </span>
                {/* What the night was, then what the lanes were. Either can be
                    missing, and the row reads without them. */}
                {(row.event || row.lanes.length > 0 || row.oilPattern) && (
                  <span className="block truncate text-xs text-ink-secondary">
                    {[row.event, laneLabel(row.lanes), row.oilPattern].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
                  {detail(row)}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
            </button>
          </li>
        ))}
      </ul>
    </FormSheet>,
    document.body
  );
}
