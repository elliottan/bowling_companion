/**
 * Whether a loading screen is standing in for the screen about to arrive.
 *
 * A pushed screen that has not been opened before has to fetch its code, and
 * until it arrives the bowler sees a loading screen in its place. That screen
 * slides in like any push, so the real one, mounting a moment later, must not
 * slide in a second time over it: it takes the loading screen's place instead.
 * `OverlayLoading` holds this up while it is on screen and `PushScreen` reads
 * it as it mounts. A plain object, not state: nothing renders from it.
 *
 * `since` is when the loading screen's slide began. Its code usually arrives
 * well inside that slide, in the app a frame or two in, and a real screen that
 * simply took its place then stood still where the loading screen had barely
 * moved: the first open of every screen arrived with no slide at all. So the
 * real screen carries the slide on from where it had got to.
 */
export const overlayHandoff = { active: false, since: 0 };

/** How long the push slide runs (`animate-push-in` in index.css). */
export const PUSH_IN_MS = 280;
