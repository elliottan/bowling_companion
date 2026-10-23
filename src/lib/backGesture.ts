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
 *
 * While the finger is down the shell also reports how far it has come, and the
 * screen in front follows it, as a native navigation pop does. Let go past the
 * point of no return and the screen slides on out from where the finger left
 * it; short of it, the screen slides back.
 */

/** Fired on `window` by the iOS shell when the edge swipe is recognised. */
export const NATIVE_BACK_EVENT = "headpin:back";
/** Fired while the finger moves; `detail` is how far right it is, in px. */
export const NATIVE_BACK_DRAG_EVENT = "headpin:back-drag";
/** Fired when the finger lets go short of going back. */
export const NATIVE_BACK_CANCEL_EVENT = "headpin:back-cancel";

interface PushExit {
  exit: () => void;
  /** The box that slides, for the finger to move. */
  panel?: () => HTMLElement | null;
}

const pushes: PushExit[] = [];

/** A pushed screen registers its animated exit while it is mounted. Mount order
 *  is stacking order, so the last one is the screen in front. */
export function registerPushExit(exit: () => void, panel?: () => HTMLElement | null): () => void {
  const entry = { exit, panel };
  pushes.push(entry);
  return () => {
    const i = pushes.lastIndexOf(entry);
    if (i >= 0) pushes.splice(i, 1);
  };
}

function topPush(): PushExit | undefined {
  return getOpenSheets().length === 0 ? pushes[pushes.length - 1] : undefined;
}

/** The panel the finger is holding, and the inline styles it had before. */
let held: { el: HTMLElement; transform: string; transition: string } | null = null;

/** Gives the panel its own slide back: the exit's slide, or the return to rest,
 *  runs from wherever the finger left it. */
function release(): HTMLElement | null {
  if (!held) return null;
  const { el, transition } = held;
  held = null;
  el.style.transition = transition;
  return el;
}

/** The finger has come `x` px from the edge: the screen in front follows it. */
export function dragBack(x: number): void {
  const el = topPush()?.panel?.();
  if (!el) return;
  if (held?.el !== el) {
    release();
    held = { el, transform: el.style.transform, transition: el.style.transition };
    el.style.transition = "none";
  }
  el.style.transform = `translateX(${Math.max(0, x)}px)`;
}

/** Let go short of going back: the screen slides back to rest. */
export function cancelBack(): void {
  const prior = held?.transform ?? "";
  const el = release();
  if (el) el.style.transform = prior;
}

/** Back, as the edge swipe asks for it. An open sheet or dialog is in front of
 *  any pushed screen and closes through history (sheetBackStack), as does a
 *  screen that is not a push, so those keep the plain `history.back()`. */
export function swipeBack(): void {
  release();
  const top = topPush();
  if (top) top.exit();
  else window.history.back();
}

/** Listens for the shell's swipe for as long as the app is mounted. */
export function useNativeBackSwipe(): void {
  useEffect(() => {
    const drag = (e: Event) => dragBack(Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener(NATIVE_BACK_EVENT, swipeBack);
    window.addEventListener(NATIVE_BACK_DRAG_EVENT, drag);
    window.addEventListener(NATIVE_BACK_CANCEL_EVENT, cancelBack);
    return () => {
      window.removeEventListener(NATIVE_BACK_EVENT, swipeBack);
      window.removeEventListener(NATIVE_BACK_DRAG_EVENT, drag);
      window.removeEventListener(NATIVE_BACK_CANCEL_EVENT, cancelBack);
    };
  }, []);
}
