/**
 * A touch that slides off a control before it lifts does not press it, as a
 * UIKit button does not (ADR-185). The browser fires `click` on lift for any
 * touch that did not scroll the page, wherever the finger ended, so a press
 * held on More and dragged away to change one's mind still opened the menu.
 *
 * One listener set for the whole document rather than a prop on each control:
 * every button, link and role=button in the app behaves the same, including
 * ones written later. Mouse presses are left alone, since a desktop browser
 * already drops a click released off the control.
 *
 * The control is forgiven a margin round its box before the press counts as
 * gone, as UIKit's is (its is about 70pt; this is smaller, because the app's
 * controls sit closer together than a system bar's), and coming back inside
 * the margin before lifting presses it after all.
 */

/** How far past a control's edge a finger can wander and still press it. */
export const PRESS_SLOP_PX = 32;

const CONTROL = 'button, a[href], [role="button"]';

export function installPressCancel(doc: Document = document): () => void {
  let control: Element | null = null;
  let pointerId: number | null = null;
  let outside = false;

  const reset = () => {
    control = null;
    pointerId = null;
    outside = false;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return reset();
    const target = e.target instanceof Element ? e.target.closest(CONTROL) : null;
    control = target;
    pointerId = target ? e.pointerId : null;
    outside = false;
  };

  const onMove = (e: PointerEvent) => {
    if (!control || e.pointerId !== pointerId) return;
    const r = control.getBoundingClientRect();
    outside =
      e.clientX < r.left - PRESS_SLOP_PX ||
      e.clientX > r.right + PRESS_SLOP_PX ||
      e.clientY < r.top - PRESS_SLOP_PX ||
      e.clientY > r.bottom + PRESS_SLOP_PX;
  };

  const onClick = (e: MouseEvent) => {
    const pressed = control;
    const cancelled = outside;
    reset();
    if (!pressed || !cancelled) return;
    if (e.target instanceof Node && pressed.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("pointermove", onMove, true);
  // A scroll takes the touch over and the browser sends no click at all.
  doc.addEventListener("pointercancel", reset, true);
  doc.addEventListener("click", onClick, true);
  return () => {
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("pointercancel", reset, true);
    doc.removeEventListener("click", onClick, true);
  };
}
