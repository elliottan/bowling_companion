import { plural, t } from "@lingui/core/macro";
import { formatPercent } from "../lib/format";
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
      subtitle={plural(sessions.length, {
        one: `Game ${gameNumber}, # session`,
        other: `Game ${gameNumber}, # sessions`
      })}
      rows={sessions}
      onSelect={onSelect}
      onClose={onClose}
      detail={(s) => (
        <>
          <Rate
            label={t({ message: "Pocket", comment: "Bowling term: the strike pocket, where the ball should hit the pins. A rate label." })}
            spoken={t({ message: "pocket", comment: "Bowling term: the strike pocket. Lower case, read aloud before a count." })}
            made={s.pocket}
            of={s.firstBalls}
          />
          <Rate
            label={t({ message: "Carry", comment: "Bowling term: how often a ball that hit the pocket carried for a strike. A rate label." })}
            spoken={t({ message: "carry", comment: "Bowling term: pocket carry. Lower case, read aloud before a count." })}
            made={s.pocketStrikes}
            of={s.pocket}
          />
          <Rate
            label={t({ message: "Strike", comment: "Bowling term: all ten pins down with the first ball. A rate label." })}
            spoken={t({ message: "strike", comment: "Bowling term: a strike. Lower case, read aloud before a count." })}
            made={s.strikes}
            of={s.firstBalls}
          />
          <span className="text-ink-tertiary">
            {plural(s.firstBalls, { one: "# ball", other: "# balls" })}
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
function Rate({ label, spoken, made, of }: { label: string; spoken: string; made: number; of: number }) {
  const pct = of === 0 ? null : Math.round((made / of) * 100);
  const strong = pct !== null && pct >= 70;
  return (
    <span aria-label={
        pct === null
          ? t`${{ spoken }} ${{ made }} of ${{ of }}`
          : t`${{ spoken }} ${{ made }} of ${{ of }}, ${{ percent: formatPercent(pct) }}`
      }>
      <span className="text-ink-secondary" aria-hidden="true">
        {label}
      </span>{" "}
      <span className={`font-semibold ${strong ? "text-accent" : "text-ink"}`} aria-hidden="true">
        {pct === null ? "-" : formatPercent(pct)}
      </span>{" "}
      <span className="text-ink-tertiary" aria-hidden="true">
        {made}/{of}
      </span>
    </span>
  );
}
