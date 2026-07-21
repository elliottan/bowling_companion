/**
 * The app never scrolls the document — `html, body` are `overflow: hidden` and
 * the shell is `position: fixed`, with scrolling confined to `<main>`. So a
 * non-zero document scroll is always spurious.
 *
 * It matters because iOS leaves one behind after a rotation round-trip in a
 * standalone PWA (measured at 62px, ≈ the safe-area top inset). The fixed shell
 * still paints against the visual viewport, but taps resolve in layout space —
 * so every touch target sits displaced by exactly that offset until relaunch.
 * See `docs/VIEWPORT-BUG.md`.
 *
 * The one legitimate exception is the on-screen keyboard: iOS scrolls the page
 * to reveal a focused field, and fighting that would hide what the user is
 * typing into.
 */
export function shouldResetScroll(offset: number, textFieldFocused: boolean): boolean {
  if (textFieldFocused) return false;
  return Math.abs(offset) > 0.5;
}
