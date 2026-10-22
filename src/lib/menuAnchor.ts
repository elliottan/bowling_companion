/** Where a menu hangs from, in viewport coordinates. */
export interface MenuAnchor {
  left: number;
  top: number;
}

/** Anchor a menu of `width` px under the control that opened it, its right
 *  edge on the control's, clamped so it cannot run off a narrow screen. */
export function anchorUnder(el: Element, width: number): MenuAnchor {
  const r = el.getBoundingClientRect();
  return { left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), top: r.bottom + 6 };
}
