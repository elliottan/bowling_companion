import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Where a tab was when you left it.
 *
 * Tabs are unmounted on switch, not hidden: `App` keys `<main>` on the view so
 * each one re-enters with its own animation, and five live views mounted at
 * once would each hold their own Dexie subscriptions. The cost of that is a
 * tab that forgets, so what the user chose (a pane, a filter, a scroll offset)
 * is parked here on the way out and read back on the way in.
 *
 * Module-level, deliberately: this is app-run memory, not persisted state. A
 * reload starts clean, the same as a cold launch.
 */
const values = new Map<string, unknown>();
const scrolls = new Map<string, number>();

/** `useState` that survives the view being unmounted and mounted again. */
export function useRememberedState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    values.has(key) ? (values.get(key) as T) : initial
  );
  useEffect(() => {
    values.set(key, value);
  }, [key, value]);
  return [value, setValue];
}

export function rememberScroll(key: string, top: number) {
  scrolls.set(key, top);
}

export function rememberedScroll(key: string): number {
  return scrolls.get(key) ?? 0;
}

/**
 * Put a scroller back where it was, and keep trying while its content is still
 * arriving. A tab's list is read from Dexie a tick after it mounts, so at mount
 * the element is often one screen tall and a single assignment clamps to the
 * top. The offset is re-read on each attempt, so a user who scrolls in the
 * meantime is followed rather than fought.
 *
 * Polling rather than a ResizeObserver: the content that has to arrive is not
 * always a resize of the element or its first child, and a fixed handful of
 * ticks is easier to reason about than which node happens to grow. It stops as
 * soon as the offset sticks, and gives up after `RESTORE_TRIES`.
 *
 * Returns a cleanup, for the effect that owns it.
 */
export function restoreScroll(el: HTMLElement, key: string): () => void {
  let tries = 0;
  let timer: number | undefined;

  const apply = () => {
    const target = rememberedScroll(key);
    el.scrollTop = target;
    // Content is still short, so the assignment clamped. Try again shortly.
    if (Math.abs(el.scrollTop - target) >= 1 && ++tries < RESTORE_TRIES) {
      timer = window.setTimeout(apply, RESTORE_TICK_MS);
    }
  };
  apply();

  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/** Roughly a second of waiting for a mounting view to fill out. */
const RESTORE_TRIES = 20;
const RESTORE_TICK_MS = 50;

/** Test seam: drops everything remembered. */
export function clearViewMemory() {
  values.clear();
  scrolls.clear();
}
