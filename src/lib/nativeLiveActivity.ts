import { unthenable } from "./nativePlugin";
import { isIOSApp } from "./platform";
import type { LiveActivityPayload, LiveActivityState } from "./liveActivity";

/**
 * The iPhone app's Live Activity for the game being scored (ADR-221,
 * `ios/App/App/HeadpinLiveActivityPlugin.swift`).
 *
 * The page decides what the Lock Screen says (`liveActivity.ts`); the phone
 * draws it. Everything here is fire and forget: a ball recorded never waits on
 * ActivityKit, and a phone that cannot or will not show an activity (iOS
 * before 16.1, Live Activities switched off, the plugin missing from an older
 * build) is not an error to anyone. The web app and the Android app load none
 * of it.
 */

export interface LiveActivityStatus {
  /** iOS 16.1 or later, and a build that carries the widget. */
  supported: boolean;
  /** The bowler has not switched Live Activities off for Headpin in the
   *  phone's Settings. */
  enabled: boolean;
}

export interface LiveActivityPlugin {
  status(): Promise<LiveActivityStatus>;
  /** Shows the game, replacing any other game's activity. If this game
   *  already has one it is updated instead. */
  start(options: LiveActivityPayload): Promise<{ active: boolean }>;
  /** Updates this game's activity; `active: false` when there is none. */
  update(options: LiveActivityPayload): Promise<{ active: boolean }>;
  /** Ends the activity: this game's, or whatever is showing when no game is
   *  named. `state` is the last thing it shows while it lingers for
   *  `dismissAfter` seconds (0 or absent: gone at once). */
  end(options: { gameId?: number; state?: LiveActivityState; dismissAfter?: number }): Promise<void>;
}

let plugin: Promise<LiveActivityPlugin> | null = null;

/** Registered once, for the same reason as the store's (`loadStorePlugin`). */
export function loadLiveActivityPlugin(): Promise<LiveActivityPlugin> {
  plugin ??= import("@capacitor/core").then(({ registerPlugin }) =>
    unthenable(registerPlugin<LiveActivityPlugin>("HeadpinLiveActivity"))
  );
  return plugin;
}

/** How long a finished game's score stays on the Lock Screen. */
export const FINAL_SCORE_LINGER_SECONDS = 5 * 60;

type Job = () => Promise<void>;

export interface LiveActivityController {
  /** The game is in progress: show it, or bring what shows up to date. */
  show(payload: LiveActivityPayload): void;
  /** The game is over: keep its final score up for a few minutes, then go. */
  finish(payload: LiveActivityPayload): void;
  /** The game or its session is gone, or the bowler turned the feature off:
   *  take the activity down now. Without a game, whatever is showing. */
  stop(gameId?: number): void;
}

/**
 * Sends the page's word to the phone in order, and no faster than the phone
 * answers. Balls arrive quicker than ActivityKit takes updates, so while one
 * call is out only the latest of the next ones is kept: an update that was
 * overtaken by a newer one was never worth sending. An end is never dropped
 * for an update about another game, but a newer word about the same game
 * (the game reopened by an undo, say) rightly replaces it.
 */
export function createLiveActivityController(
  load: () => Promise<LiveActivityPlugin>,
  enabled: () => boolean = () => isIOSApp()
): LiveActivityController {
  // The game the phone is known to be showing, so a later ball is an update
  // and not a second request.
  let showing: number | null = null;
  let queued: Job | null = null;
  let running = false;

  function enqueue(job: Job): void {
    queued = job;
    if (running) return;
    running = true;
    void (async () => {
      while (queued) {
        const next: Job = queued;
        queued = null;
        try {
          await next();
        } catch {
          // The phone said no: an old build without the plugin, Live
          // Activities off, ActivityKit at its limit. Nothing to tell anyone.
        }
      }
      running = false;
    })();
  }

  return {
    show(payload) {
      if (!enabled()) return;
      enqueue(async () => {
        const live = await load();
        if (showing === payload.gameId) {
          const { active } = await live.update(payload);
          if (active) return;
        }
        const { active } = await live.start(payload);
        showing = active ? payload.gameId : null;
      });
    },
    finish(payload) {
      if (!enabled()) return;
      enqueue(async () => {
        const live = await load();
        showing = null;
        await live.end({
          gameId: payload.gameId,
          state: payload.state,
          dismissAfter: FINAL_SCORE_LINGER_SECONDS
        });
      });
    },
    stop(gameId) {
      if (!enabled()) return;
      // A game that was never shown has nothing to take down.
      if (gameId !== undefined && showing !== null && showing !== gameId) return;
      enqueue(async () => {
        const live = await load();
        showing = null;
        await live.end(gameId === undefined ? {} : { gameId });
      });
    }
  };
}

/** The app's one controller. */
export const liveActivity = createLiveActivityController(loadLiveActivityPlugin);

/** What the phone can do, for the Settings row; null off the iPhone app or
 *  when the plugin does not answer. */
export async function readLiveActivityStatus(
  load: () => Promise<LiveActivityPlugin> = loadLiveActivityPlugin,
  native: boolean = isIOSApp()
): Promise<LiveActivityStatus | null> {
  if (!native) return null;
  try {
    return await (await load()).status();
  } catch {
    return null;
  }
}
