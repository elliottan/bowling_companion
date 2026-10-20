import { MOVE_GAMES_STEPS } from "../lib/moveGames";

/** The numbered steps for moving games from the web into the app. */
export function MoveGamesSteps({ className = "" }: { className?: string }) {
  return (
    <ol className={`list-decimal space-y-1 pl-5 text-sm text-ink-secondary ${className}`}>
      {MOVE_GAMES_STEPS.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
