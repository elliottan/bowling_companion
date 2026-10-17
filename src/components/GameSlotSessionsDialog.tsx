import { createPortal } from "react-dom";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import type { GameSlotSession } from "../lib/stats";
import { laneLabel } from "./SessionHeaderText";

interface GameSlotSessionsDialogProps {
  gameNumber: number;
  sessions: GameSlotSession[];
  onSelect: (sessionId: number, gameId: number) => void;
  onClose: () => void;
}

/**
 * The nights behind one point of the by-game chart. "Game 3 averages 178"
 * hides which game 3s, so the point opens into them, newest first, each with
 * its whole night and this game picked out, and each row goes to that game.
 * The same dialog the Balls card's game columns open (`BallGameSessionsDialog`).
 */
export function GameSlotSessionsDialog({ gameNumber, sessions, onSelect, onClose }: GameSlotSessionsDialogProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, true);

  // Portalled to the body: the stats pane slides on a CSS transform, and a
  // transformed ancestor makes `fixed` resolve against it.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Game ${gameNumber}, every session`}
      style={{ ...backdropStyle, ...rootStyle }}
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
        <h2 className="text-base font-bold text-ink">Game {gameNumber}</h2>
        <p className="mt-1 text-xs text-ink-secondary">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}, newest first
        </p>

        <ul className="-mx-2 mt-3 min-h-0 flex-1 divide-y divide-edge overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.gameId}>
              <button
                type="button"
                // Closed first, then the game opened, in one step: handing the
                // selection over alone left the dialog in the caller's state.
                onClick={() =>
                  dismiss(() => {
                    onClose();
                    onSelect(s.sessionId, s.gameId);
                  })
                }
                className="flex w-full flex-col gap-0.5 px-2 py-2.5 text-left active:bg-surface-muted"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-strong">{s.alley}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-secondary">{s.date}</span>
                </span>
                {(s.event || s.lanes.length > 0 || s.oilPattern) && (
                  <span className="truncate text-xs text-ink-secondary">
                    {[s.event, laneLabel(s.lanes), s.oilPattern].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="mt-1 flex flex-wrap items-baseline gap-1 text-xs tabular-nums">
                  {s.scores.map((score, i) => {
                    const mine = i + 1 === gameNumber;
                    return (
                      <span
                        key={i}
                        aria-current={mine ? "true" : undefined}
                        className={`rounded-md px-1.5 py-0.5 ${
                          mine ? "bg-accent-fill text-accent-on-fill" : "bg-surface-muted text-ink-secondary"
                        }`}
                      >
                        <span className={mine ? "" : "text-ink-tertiary"}>G{i + 1}</span>{" "}
                        <span className="font-semibold">{score ?? "-"}</span>
                      </span>
                    );
                  })}
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
