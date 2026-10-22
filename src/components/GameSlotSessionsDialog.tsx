import type { GameSlotSession } from "../lib/stats";
import { GameRowsSheet } from "./GameRowsSheet";

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
 * The same sheet the Balls card's game columns open (`BallGameSessionsDialog`).
 */
export function GameSlotSessionsDialog({ gameNumber, sessions, onSelect, onClose }: GameSlotSessionsDialogProps) {
  return (
    <GameRowsSheet
      title={`Game ${gameNumber}`}
      subtitle={`${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}, newest first`}
      rows={sessions}
      onSelect={onSelect}
      onClose={onClose}
      detail={(s) =>
        s.scores.map((score, i) => {
          const mine = i + 1 === gameNumber;
          return (
            <span key={i} aria-current={mine ? "true" : undefined}>
              <span className="text-ink-tertiary">G{i + 1}</span>{" "}
              <span className={`font-semibold ${mine ? "text-accent" : "text-ink-secondary"}`}>{score ?? "-"}</span>
            </span>
          );
        })
      }
    />
  );
}
