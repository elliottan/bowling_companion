/**
 * What a bowler did last time at an alley, in words: the card that reads one
 * night back, and the phrasing of a line and a move. Shared by the Alley
 * report, the Start session sheet and the scorer's game hint (ADR-115), so the
 * three never describe the same night differently.
 */
import { formatSessionDate } from "../lib/dates";
import type { GameLine, LastTimeHere } from "../lib/briefing";
import { describeLine } from "./alleyHistoryCopy";

/** The night itself, and the way into it. */
export function LastTimeCard({
  last,
  onOpen
}: {
  last: LastTimeHere;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{last.alley}</span>
        <span className="text-xs tabular-nums text-ink-tertiary">{formatSessionDate(last.date)}</span>
      </span>
      <span className="mt-1 block text-sm text-ink-strong">{describeLastTime(last)}</span>
      {last.perGame.length > 0 && (
        <span className="mt-2.5 block border-t border-edge pt-1">
          {last.perGame.map((game) => (
            <GameLineRow key={game.gameNumber} line={game} />
          ))}
        </span>
      )}
    </>
  );

  if (!onOpen) {
    return <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${last.alley}, ${formatSessionDate(last.date)}`}
      className="block w-full rounded-xl border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
    >
      {body}
    </button>
  );
}

function describeLastTime(last: LastTimeHere): string {
  const scored =
    last.average === null
      ? `${last.games} ${last.games === 1 ? "game" : "games"}, nothing scored`
      : `${last.games} ${last.games === 1 ? "game" : "games"} averaging ${last.average}`;

  if (last.ballName && last.stance !== undefined && last.target !== undefined) {
    return `${scored}. You played the ${last.ballName} from stance ${last.stance} to target ${last.target}.`;
  }
  if (last.ballName) return `${scored}, mostly on the ${last.ballName}.`;
  return `${scored}.`;
}

/**
 * One game of the session read back: what you threw and where from.
 *
 * A span rather than a list item, because these sit inside the button that
 * opens the session and a button may not contain a list.
 */
function GameLineRow({ line }: { line: GameLine }) {
  return (
    <span className="flex items-baseline gap-3 py-1">
      <span className="w-14 shrink-0 text-xs text-ink-tertiary">Game {line.gameNumber}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">
        {describeLine(line)}
      </span>
      {line.score !== null && (
        <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">{line.score}</span>
      )}
    </span>
  );
}
