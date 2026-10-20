/**
 * The steps for bringing games bowled on the web into the app
 * (docs/PRO-LAUNCH.md, "Moving games from the web to the app").
 *
 * Games bowled on the web live in that browser, so they travel as a backup
 * file. The import on the other end is the existing merge (ADR-038); this file
 * only holds the words, so the app's first run and the web's "Get the app"
 * card say the same thing.
 */

export const MOVE_GAMES_TITLE = "Bowled with Headpin on the web?";

export const MOVE_GAMES_STEPS: readonly string[] = [
  "On headpin.app, open Settings, then Backup & restore, and export your games.",
  "In the app, open Settings, then Backup & restore, and import.",
  "Pick the file from Files."
];
