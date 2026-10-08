/**
 * Whether a loading screen is standing in for the screen about to arrive.
 *
 * A pushed screen that has not been opened before has to fetch its code, and
 * until it arrives the bowler sees a loading screen in its place. That screen
 * slides in like any push, so the real one, mounting a moment later, must not
 * slide in a second time over it: it takes the loading screen's place instead.
 * `OverlayLoading` holds this up while it is on screen and `PushScreen` reads
 * it as it mounts. A plain object, not state: nothing renders from it.
 */
export const overlayHandoff = { active: false };
