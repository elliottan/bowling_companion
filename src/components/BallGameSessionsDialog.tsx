import type { BallGameSession } from "../lib/stats";
import { GameRowsSheet } from "./GameRowsSheet";

interface BallGameSessionsDialogProps {
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
  ballName,
  gameNumber,
  sessions,
  onSelect,
  onClose
}: BallGameSessionsDialogProps) {
  return (
    <GameRowsSheet
      title={ballName}
      subtitle={`Game ${gameNumber}, ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}
      rows={sessions}
      onSelect={onSelect}
      onClose={onClose}
      detail={(s) => (
        <>
          <Rate label="Pocket" made={s.pocket} of={s.firstBalls} />
          <Rate label="Carry" made={s.pocketStrikes} of={s.pocket} />
          <Rate label="Strike" made={s.strikes} of={s.firstBalls} />
          <span className="text-ink-tertiary">
            {s.firstBalls} {s.firstBalls === 1 ? "ball" : "balls"}
          </span>
        </>
      )}
    />
  );
}

/**
 * One rate as words and figures: the name, the percentage, and the
 * made-over-thrown count. The counts stay because a percentage off three balls
 * is not the same claim as one off thirty, and a good rate takes the accent, so
 * a glance down the list finds the nights that went well.
 */
function Rate({ label, made, of }: { label: string; made: number; of: number }) {
  const pct = of === 0 ? null : Math.round((made / of) * 100);
  const strong = pct !== null && pct >= 70;
  return (
    <span aria-label={`${label.toLowerCase()} ${made} of ${of}${pct === null ? "" : `, ${pct}%`}`}>
      <span className="text-ink-secondary" aria-hidden="true">
        {label}
      </span>{" "}
      <span className={`font-semibold ${strong ? "text-accent" : "text-ink"}`} aria-hidden="true">
        {pct === null ? "-" : `${pct}%`}
      </span>{" "}
      <span className="text-ink-tertiary" aria-hidden="true">
        {made}/{of}
      </span>
    </span>
  );
}
