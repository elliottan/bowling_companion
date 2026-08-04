import { useCallback, useEffect, useRef } from "react";
import type { NavAction, NavState } from "./appNavigation";
import { parseRoute, routeHash, shouldPushHistory } from "./appRoute";

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

  // The state arrives already restored from the URL (see `initialNavFromHash`),
  // so there is nothing to read on mount: normalise the address bar and leave
  // the entry we loaded on alone.
  useEffect(() => {
    window.history.replaceState({ depth: 0 }, "", routeHash(previous.current));
  }, []);

  useEffect(() => {
    function onPopState() {
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
      depth.current += 1;
      window.history.pushState({ depth: depth.current }, "", hash);
    } else {
      window.history.replaceState({ depth: depth.current }, "", hash);
    }
  }, [state]);

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
