import { createPortal } from "react-dom";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import type { BallGameSession } from "../lib/stats";

interface BallGameSessionsDialogProps {
  open: boolean;
  ballName: string;
  gameNumber: number;
  sessions: BallGameSession[];
  onSelect: (sessionId: number, gameId: number) => void;
  onClose: () => void;
}

/**
 * The games behind one ball's game-number column. A rate over several nights
 * hides which nights, so the cell opens into them and each row goes to the
 * game it counted.
 */
export function BallGameSessionsDialog({
  open,
  ballName,
  gameNumber,
  sessions,
  onSelect,
  onClose
}: BallGameSessionsDialogProps) {
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  if (!open) return null;

  // Portalled to the body: the stats pane slides on a CSS transform, and a
  // transformed ancestor makes `fixed` resolve against it rather than the
  // viewport, which parks the dialog half off-screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${ballName}, game ${gameNumber}`}
      style={backdropStyle}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        className={`flex max-h-[70vh] w-full max-w-sm flex-col rounded-xl bg-surface p-5 shadow-xl ${
          exiting ? "" : "animate-pop-in"
        }`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">
          {ballName}, game {gameNumber}
        </h2>
        <p className="mt-1 text-xs text-ink-secondary">
          {sessions.length} {sessions.length === 1 ? "game" : "games"} behind this column.
        </p>

        <ul className="-mx-2 mt-3 min-h-0 flex-1 divide-y divide-edge overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.gameId}>
              <button
                type="button"
                onClick={() => dismiss(() => onSelect(s.sessionId, s.gameId))}
                className="flex w-full flex-col gap-0.5 px-2 py-2.5 text-left"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-strong">
                    {s.alley}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-secondary">{s.date}</span>
                </span>
                <span className="text-xs tabular-nums text-ink-secondary">
                  {s.firstBalls} {s.firstBalls === 1 ? "ball" : "balls"} · {s.strikes} strike
                  {s.strikes === 1 ? "" : "s"} · {s.pocket} pocket
                  {s.oilPattern ? ` · ${s.oilPattern}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
