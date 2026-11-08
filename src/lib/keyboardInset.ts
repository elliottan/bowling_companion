/**
 * How much of the screen the on-screen keyboard covers, for the web app.
 *
 * Safari draws the keyboard over the page rather than shrinking it, so a sheet
 * fixed to the bottom of the screen stays where it is and the field that was
 * tapped ends up behind the keys (ADR-255). The visual viewport is what is
 * left showing: the keyboard covers the layout viewport below it, and when iOS
 * pans to reveal a field, the strip above it too.
 *
 * The iPhone and Android apps shrink their web view for the keyboard instead,
 * so there the visual and layout viewports agree and both insets are zero.
 *
 * Measured only while a text field has focus, and zero otherwise: this lifts
 * what floats over the shell, it never sizes the shell, which is the line
 * `docs/VIEWPORT-BUG.md` draws. A stale reading after a rotation lasts only
 * until the field is left.
 */
export interface KeyboardInsets {
  /** Covered at the foot: the keyboard, in CSS px. */
  bottom: number;
  /** Panned off the top when iOS scrolls the view to the field, in CSS px. */
  top: number;
}

export const NO_KEYBOARD: KeyboardInsets = { bottom: 0, top: 0 };

/** Below this a difference is rounding, or the bar Safari shows over a field,
 *  not a keyboard. */
const MIN_KEYBOARD = 80;

export function keyboardInsets(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number } | null,
  textFieldFocused: boolean
): KeyboardInsets {
  if (!textFieldFocused || !viewport) return NO_KEYBOARD;
  const top = Math.max(0, Math.round(viewport.offsetTop));
  const bottom = Math.max(0, Math.round(layoutHeight - viewport.offsetTop - viewport.height));
  if (bottom < MIN_KEYBOARD) return NO_KEYBOARD;
  return { bottom, top };
}

/** A field the keyboard comes up for. A button, a checkbox, a range or a
 *  select brings no keyboard. */
export function isTypingField(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color", "image", "hidden"].includes(type);
}

/**
 * Keeps `--keyboard-inset` and `--keyboard-top` on the root up to date, and
 * brings the focused field back into sight once the keyboard has settled.
 * Returns the cleanup.
 */
export function watchKeyboardInsets(win: Window = window): () => void {
  const root = win.document.documentElement;
  let last = NO_KEYBOARD;

  const apply = () => {
    const vv = win.visualViewport;
    const focused = win.document.activeElement;
    const next = keyboardInsets(
      win.innerHeight,
      vv ? { height: vv.height, offsetTop: vv.offsetTop } : null,
      isTypingField(focused)
    );
    if (next.bottom === last.bottom && next.top === last.top) return;
    const opened = last.bottom === 0 && next.bottom > 0;
    last = next;
    root.style.setProperty("--keyboard-inset", `${next.bottom}px`);
    root.style.setProperty("--keyboard-top", `${next.top}px`);
    // Once whatever floats has moved up, the field may still sit under the
    // keys inside its own scroller: bring it into the strip that shows.
    if (opened && focused instanceof HTMLElement) {
      win.requestAnimationFrame(() => revealField(win, focused));
    }
  };

  // Leaving a field for the page drops the keyboard; moving to another field
  // keeps it, so the check waits a moment for the new focus to land.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(pending);
    pending = setTimeout(apply, 60);
  };

  const vv = win.visualViewport;
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
  win.document.addEventListener("focusin", later);
  win.document.addEventListener("focusout", later);
  apply();
  return () => {
    clearTimeout(pending);
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    win.document.removeEventListener("focusin", later);
    win.document.removeEventListener("focusout", later);
    root.style.removeProperty("--keyboard-inset");
    root.style.removeProperty("--keyboard-top");
  };
}

/** Scrolls a field into the visible strip, by as little as it takes, and only
 *  when it is hidden: scrolling a field already in sight was a jarring jump. */
export function revealField(win: Window, field: HTMLElement): void {
  const vv = win.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const bottom = top + (vv?.height ?? win.innerHeight);
  const rect = field.getBoundingClientRect();
  if (rect.top < top + 8 || rect.bottom > bottom - 8) {
    field.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
