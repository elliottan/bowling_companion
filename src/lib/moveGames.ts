/**
 * The steps for bringing games bowled on the web into the app
 * (docs/PRO-LAUNCH.md, "Moving games from the web to the app").
 *
 * Games bowled on the web live in that browser, so they travel as a backup
 * file. The import on the other end is the existing merge (ADR-038); this file
 * only holds the words, so the app's first run and the web's "Get the app"
 * card say the same thing.
 */

import { i18n } from "@lingui/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

/** The heading, read in the active language. */
export function moveGamesTitle(): string {
  return t`Bowled with Headpin on the web?`;
}

const STEP_MESSAGES: MessageDescriptor[] = [
  msg({ message: "On headpin.app, open Settings, then Backup & restore, and export your games.", comment: "Step 1 of moving games from the web to the app. headpin.app is a web address and stays as it is" }),
  msg({ message: "In the app, open Settings, then Backup & restore, and import.", comment: "Step 2 of moving games from the web to the app" }),
  msg({ message: "Pick the file from Files.", comment: "Step 3 of moving games from the web to the app. Files is the phone's Files app" })
];

/** The steps, each read in the active language when used: every entry is a
 *  getter over its message, so nothing is fixed at import. */
export const MOVE_GAMES_STEPS: readonly string[] = (() => {
  const list: string[] = [];
  STEP_MESSAGES.forEach((descriptor, i) => {
    Object.defineProperty(list, i, { get: () => i18n._(descriptor), enumerable: true });
  });
  return list;
})();
