/**
 * A tap on the status bar takes the list in view back to its top, as it does
 * in every iPhone app.
 *
 * The web view's own version of this only scrolls the document, and this app
 * never scrolls the document: the shell is `position: fixed` and every list is
 * a scroller inside it (docs/VIEWPORT-BUG.md). So the native app passes the tap
 * on as a `statusTap` window event (`HeadpinTabBarPlugin.swift`) and the page
 * finds the scroller itself: the nearest one, from the middle of the screen
 * out, that has somewhere to go. One rule for every screen and sheet, so none
 * has to opt in.
 *
 * An installed web app gets no such tap: Safari hands a page nothing when its
 * status bar is touched, so there the gesture is the native app's alone.
 */

/** The scroller that a tap at `start` sits in and that is scrolled down, or
 *  null when nothing on that path has anywhere to go. */
export function scrolledAncestor(start: Element | null): HTMLElement | null {
  for (let el: Element | null = start; el; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollTop <= 0) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return el;
  }
  return null;
}

/** Scrolls the list in the middle of the screen to its top. True when one moved. */
export function scrollViewToTop(doc: Document = document): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  const start = doc.elementFromPoint?.(view.innerWidth / 2, view.innerHeight / 2) ?? null;
  const scroller = scrolledAncestor(start);
  if (!scroller) return false;
  const reduce = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (scroller.scrollTo) scroller.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  else scroller.scrollTop = 0;
  return true;
}

/** Listens for the native status-bar tap for as long as the app is open. */
export function listenForStatusTap(target: Window = window): () => void {
  const onTap = () => {
    scrollViewToTop(target.document);
  };
  target.addEventListener("statusTap", onTap);
  return () => target.removeEventListener("statusTap", onTap);
}
