/**
 * Which sheets and dialogs are open, so back can close the topmost one.
 *
 * Pushed screens are routes (ADR-041), so back already closes them. Sheets are
 * local component state and history knows nothing about them, which left back
 * closing everything *except* the layer actually in front of the user.
 *
 * The fix is one sentinel history entry for "something is open", not one per
 * sheet. `useHistoryRoute` owns that entry, because it already owns the depth
 * counter and the only popstate listener; this module is just the registry it
 * reconciles against. Registration order is mount order, so the last entry is
 * the topmost layer.
 *
 * A per-registration entry was tried first and reverted: with the push and pop
 * living in a register/unregister effect, StrictMode's double invoke ran a real
 * `history.back()` from the phantom cleanup, and a sheet over a pushed screen
 * then ate the screen's entry and walked out of the app. Nothing here pushes or
 * pops; the reconciler does, keyed on "is anything open", which makes a repeated
 * effect a no-op instead of a navigation.
 */

export interface OpenSheet {
  /** Close this layer the same way Escape would (through the exit animation). */
  close: () => void;
}

let sheets: readonly OpenSheet[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Register while open; call the returned function when it closes. The entry
 *  must be stable for the lifetime of the registration, so keep `close` reading
 *  a ref rather than re-registering on every render. */
export function registerSheet(sheet: OpenSheet): () => void {
  sheets = [...sheets, sheet];
  emit();
  return () => {
    sheets = sheets.filter((s) => s !== sheet);
    emit();
  };
}

export function subscribeSheets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A new array only when the set changes, so `useSyncExternalStore` is stable. */
export function getOpenSheets(): readonly OpenSheet[] {
  return sheets;
}

/** Close the layer in front. Returns false when there was nothing open. */
export function closeTopSheet(): boolean {
  const top = sheets[sheets.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
