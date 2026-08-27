import { useCallback, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

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
 *
 * The map is the value, not a copy of it. This used to be a `useState` seeded
 * from the map on mount, which is indistinguishable while only one component
 * reads a key: nobody else was mounted to disagree with. Two now are. The
 * Stats tab stays mounted under its own drill-downs (ADR-057), so a filter set
 * on the drill-down has to reach the tab underneath, and a seeded copy would
 * only have picked it up on the next remount.
 */
const values = new Map<string, unknown>();
const scrolls = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, onChange: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, set);
  set.add(onChange);
  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(key);
  };
}

function emit(key: string) {
  for (const listener of listeners.get(key) ?? []) listener();
}

/**
 * `useState` that survives the view being unmounted and mounted again, and is
 * shared by every component reading the same key while they are all mounted.
 */
export function useRememberedState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  // The first value is captured once. Reading `initial` on every snapshot
  // would hand `useSyncExternalStore` a new array or object each time for the
  // callers that default to one, which it reads as an endless change.
  const initialRef = useRef(initial);

  const getSnapshot = useCallback(() => {
    if (!values.has(key)) values.set(key, initialRef.current);
    return values.get(key) as T;
  }, [key]);

  const value = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    getSnapshot,
    getSnapshot
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      const prev = values.has(key) ? (values.get(key) as T) : initialRef.current;
      const next =
        typeof update === "function" ? (update as (p: T) => T)(prev) : update;
      if (Object.is(next, prev)) return;
      values.set(key, next);
      emit(key);
    },
    [key]
  );

  return [value, setValue];
}

/**
 * Write a remembered value from outside the component that owns it.
 *
 * For one screen handing another its starting state: the game plan sets the
 * Stats chart's metric on its way there. The store is already shared, so this
 * only exposes what `useRememberedState` does, without needing to mount the
 * hook for a key this caller does not otherwise read.
 */
export function setRemembered<T>(key: string, value: T) {
  if (Object.is(values.get(key), value)) return;
  values.set(key, value);
  emit(key);
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

/** Test seam: drops everything remembered. Anything still mounted is told, so
 *  it falls back to its own initial value rather than holding a cleared one. */
export function clearViewMemory() {
  const keys = [...values.keys()];
  values.clear();
  scrolls.clear();
  for (const key of keys) emit(key);
}
