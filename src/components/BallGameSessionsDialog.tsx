import { createPortal } from "react-dom";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import type { BallGameSession } from "../lib/stats";
import { laneLabel } from "./SessionHeaderText";

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
        <h2 className="text-base font-bold text-ink">{ballName}</h2>
        <p className="mt-1 text-xs text-ink-secondary">Usages in game {gameNumber}</p>

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
                {/* What the night was, then what the lanes were. Either can be
                    missing, and the row reads without them. */}
                {(s.event || s.lanes.length > 0 || s.oilPattern) && (
                  <span className="truncate text-xs text-ink-secondary">
                    {[s.event, laneLabel(s.lanes), s.oilPattern].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <Rate label="P" made={s.pocket} of={s.firstBalls} name="pocket" />
                  <Rate label="C" made={s.pocketStrikes} of={s.pocket} name="carry" />
                  <Rate label="S" made={s.strikes} of={s.firstBalls} name="strike" />
                  <span className="text-[11px] tabular-nums text-ink-tertiary">
                    {s.firstBalls} {s.firstBalls === 1 ? "ball" : "balls"}
                  </span>
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

/**
 * One rate as a small pill: the letter, the made-over-thrown count, and the
 * percentage. The counts stay because a percentage off three balls is not the
 * same claim as one off thirty, and the pill is tinted only once the rate is
 * good, so a glance down the list finds the nights that went well.
 */
function Rate({
  label,
  made,
  of,
  name
}: {
  label: string;
  made: number;
  of: number;
  name: string;
}) {
  const pct = of === 0 ? null : Math.round((made / of) * 100);
  const strong = pct !== null && pct >= 70;
  return (
    <span
      className={`flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
        strong ? "bg-accent-soft text-accent" : "bg-surface-muted text-ink-secondary"
      }`}
      aria-label={`${name} ${made} of ${of}${pct === null ? "" : `, ${pct}%`}`}
    >
      <span className="font-bold" aria-hidden="true">{label}</span>
      <span aria-hidden="true">
        {made}/{of}
      </span>
      <span className="font-semibold" aria-hidden="true">
        {pct === null ? "-" : `${pct}%`}
      </span>
    </span>
  );
}
