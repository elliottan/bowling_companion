import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { NavAction, NavState } from "./appNavigation";
import { parseRoute, routeHash, shouldPushHistory } from "./appRoute";
import { closeTopSheet, getOpenSheets, subscribeSheets } from "./sheetBackStack";

/**
 * Keeps the URL and the navigation state in step, and makes the browser's back
 * the app's only implementation of "back".
 *
 * That last part is the whole point. The app already had three ways back (the
 * nav bar's back control, Escape, and the edge-drag in `PushScreen`), and the
 * platform adds a fourth: Android's hardware back, and iOS's left-edge swipe.
 * If the in-app paths popped state directly while the platform popped history,
 * one gesture would close two screens. So every path calls `goBack`, `goBack`
 * calls `history.back()`, and `popstate` is the single place that dispatches
 * the change. Whichever mechanism fires, exactly one pop happens.
 *
 * The URL is a projection of state, never a second source of truth: state
 * changes write the hash, `popstate` reads it back through the reducer.
 */
export function useHistoryRoute(state: NavState, dispatch: (action: NavAction) => void) {
  const previous = useRef<NavState>(state);
  // Set while applying a popstate, so the sync effect below does not write the
  // entry the browser just moved us to straight back onto the stack.
  const applyingPop = useRef(false);
  // How many entries this app has pushed. `goBack` needs to know, because
  // calling history.back() with none of ours left would leave the app.
  const depth = useRef(0);
  // Whether the topmost entry is the sheet sentinel (see sheetBackStack), and
  // whether we are the ones popping it because the sheet closed by itself.
  const sentinel = useRef(false);
  const consumingSentinel = useRef(false);

  const openSheets = useSyncExternalStore(subscribeSheets, getOpenSheets, getOpenSheets);

  // The state arrives already restored from the URL (see `initialNavFromHash`),
  // so there is nothing to read on mount: normalise the address bar and leave
  // the entry we loaded on alone.
  useEffect(() => {
    window.history.replaceState({ depth: 0 }, "", routeHash(previous.current));
  }, []);

  useEffect(() => {
    function onPopState() {
      if (sentinel.current) {
        // The entry just left was the sentinel, which describes no route: the
        // only thing to undo is the layer in front. A close that started in the
        // app has already run, and is only collecting its own entry.
        sentinel.current = false;
        depth.current = Math.max(0, depth.current - 1);
        if (!consumingSentinel.current) closeTopSheet();
        consumingSentinel.current = false;
        return;
      }
      applyingPop.current = true;
      depth.current = Math.max(0, depth.current - 1);
      dispatch({ type: "restore", route: parseRoute(window.location.hash) });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dispatch]);

  useEffect(() => {
    const from = previous.current;
    previous.current = state;

    // Clear the guard before anything can return early. Leaving it set (which
    // an unchanged hash used to do) swallowed the *next* navigation instead of
    // this one, and the URL silently stopped tracking the app.
    const wasPop = applyingPop.current;
    applyingPop.current = false;

    const hash = routeHash(state);
    if (hash === window.location.hash) return;

    if (wasPop) {
      // The state ended up somewhere the popped entry did not describe (a
      // guard in the reducer, say). Follow the state, but do not stack an
      // entry for a move the user made by going back.
      window.history.replaceState({ depth: depth.current }, "", hash);
      return;
    }

    if (shouldPushHistory(from, state)) {
      if (sentinel.current) {
        // A screen opened from a sheet (the start-session form, say) takes over
        // the sheet's sentinel rather than stacking on top of it: the sheet is
        // gone, and leaving its entry buried would cost the user a second back.
        // Depth already counts it, so only the marker moves.
        sentinel.current = false;
        window.history.replaceState({ depth: depth.current }, "", hash);
        return;
      }
      depth.current += 1;
      window.history.pushState({ depth: depth.current }, "", hash);
    } else {
      window.history.replaceState({ depth: depth.current }, "", hash);
    }
  }, [state]);

  /**
   * One sentinel entry for "a sheet is open", reconciled against the registry
   * rather than pushed and popped per sheet. Nothing here runs in a cleanup, so
   * StrictMode's second invoke finds the state it wants and does nothing: the
   * phantom `history.back()` that sank the first attempt cannot happen.
   *
   * Sheets are modal, so no route change can land on top of the sentinel while
   * it is up; it is always the entry back reaches first.
   */
  useEffect(() => {
    const anyOpen = openSheets.length > 0;
    if (anyOpen && !sentinel.current) {
      sentinel.current = true;
      depth.current += 1;
      // Same hash as the entry underneath: opening a sheet is not a place.
      window.history.pushState({ depth: depth.current, sheet: true }, "", window.location.hash);
    } else if (!anyOpen && sentinel.current) {
      // Closed from inside the app (a Cancel button, Escape, a drag): collect
      // the entry so it is not left for a later back to eat.
      consumingSentinel.current = true;
      window.history.back();
    }
  }, [openSheets]);

  /**
   * Go back one step. Prefers the history stack so the platform's own back
   * stays in step; falls back to dispatching when there is nothing of ours on
   * the stack (a deep link opened straight into an overlay), because
   * `history.back()` there would leave the app entirely.
   */
  return useCallback(
    (fallback: NavAction) => {
      if (depth.current > 0) window.history.back();
      else dispatch(fallback);
    },
    [dispatch]
  );
}
