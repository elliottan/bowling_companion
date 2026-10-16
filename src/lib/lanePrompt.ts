/**
 * Games whose lane editor has already had its one automatic opening, this app
 * run. Module-level so the once-per-game rule survives tab switches, which
 * remount the scorer.
 *
 * A game started with "Score now" goes in before the scorer ever sees it: the
 * bowler chose details later, and a lanes sheet over the pin deck is the form
 * they skipped, back again (ADR-080). "Set lanes" stays one tap away.
 */
const promptedGameIds = new Set<number>();

/** Whether the lane editor may still open by itself for this game. */
export function shouldPromptLanes(gameId: number): boolean {
  return !promptedGameIds.has(gameId);
}

/** Use up the game's one automatic opening, or waive it. */
export function markLanesPrompted(gameId: number): void {
  promptedGameIds.add(gameId);
}
