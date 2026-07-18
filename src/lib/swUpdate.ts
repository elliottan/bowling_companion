/**
 * Pub-sub for "a new service worker is waiting" state. registerType is
 * "prompt" (not "autoUpdate") so we never swap the SW / reload mid-game — the
 * user chooses when via UpdateToast. Kept React-free and free of any
 * `virtual:pwa-register` import so it stays importable from Vitest, which
 * cannot resolve that virtual module; only main.tsx wires the real registerSW.
 */

type Listener = (needsRefresh: boolean) => void;

let needsRefresh = false;
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

export function setNeedsRefresh(v: boolean): void {
  needsRefresh = v;
  listeners.forEach((l) => l(v));
}

export function setUpdateFn(fn: (reload?: boolean) => Promise<void>): void {
  updateFn = fn;
}

export function applyUpdate(): Promise<void> | undefined {
  return updateFn?.(true);
}

export function subscribeNeedsRefresh(fn: Listener): () => void {
  listeners.add(fn);
  fn(needsRefresh);
  return () => listeners.delete(fn);
}
