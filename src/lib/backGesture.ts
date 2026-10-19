import { useEffect } from "react";
import { getOpenSheets } from "./sheetBackStack";

/**
 * The iPhone app's left-edge swipe (ADR-157), with the screen sliding off.
 *
 * The swipe used to run `history.back()` and nothing else, so the pushed screen
 * was unmounted on the spot while the chevron slid it away. The native side now
 * only announces the swipe; the page answers it the way it answers the
 * chevron, by asking the topmost pushed screen to leave through its own exit
 * animation, which ends in the same `history.back()`.
 */

/** Fired on `window` by the iOS shell when the edge swipe is recognised. */
export const NATIVE_BACK_EVENT = "headpin:back";

const pushes: Array<() => void> = [];

/** A pushed screen registers its animated exit while it is mounted. Mount order
 *  is stacking order, so the last one is the screen in front. */
export function registerPushExit(exit: () => void): () => void {
  pushes.push(exit);
  return () => {
    const i = pushes.lastIndexOf(exit);
    if (i >= 0) pushes.splice(i, 1);
  };
}

/** Back, as the edge swipe asks for it. An open sheet or dialog is in front of
 *  any pushed screen and closes through history (sheetBackStack), as does a
 *  screen that is not a push, so those keep the plain `history.back()`. */
export function swipeBack(): void {
  const top = getOpenSheets().length === 0 ? pushes[pushes.length - 1] : undefined;
  if (top) top();
  else window.history.back();
}

/** Listens for the shell's swipe for as long as the app is mounted. */
export function useNativeBackSwipe(): void {
  useEffect(() => {
    window.addEventListener(NATIVE_BACK_EVENT, swipeBack);
    return () => window.removeEventListener(NATIVE_BACK_EVENT, swipeBack);
  }, []);
}
