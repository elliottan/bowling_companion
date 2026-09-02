/**
 * "A new service worker is waiting" state, and the rule for when it is safe to
 * swap.
 *
 * `registerType` is "prompt" rather than "autoUpdate" so the swap is never
 * forced mid-game. Auto-apply is layered on top of that: the update is applied
 * on its own as soon as the app is somewhere losing a frame costs nothing, and
 * the toast only lingers on the one screen where it is not (the Active tab).
 *
 * Kept React-free and free of any `virtual:pwa-register` import so it stays
 * importable from Vitest, which cannot resolve that virtual module; only
 * main.tsx wires the real registerSW.
 */

type Listener = (showToast: boolean) => void;

let needsRefresh = false;
let dismissed = false;
let updateSafe = false;
let applied = false;
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<Listener>();

/**
 * Once per page. `applyUpdate` reloads, so a second call is either a no-op or a
 * reload race; and after a dismissal the toast must not come straight back.
 */
function maybeAutoApply(): void {
  if (applied || !needsRefresh || !updateSafe) return;
  applied = true;
  void applyUpdate();
}

export function setNeedsRefresh(v: boolean): void {
  needsRefresh = v;
  if (v) dismissed = false;
  notify();
  maybeAutoApply();
}

/**
 * The toast's x. It puts the toast away for this page only; the update itself
 * is still waiting and still applies as soon as it is safe to. Hiding the toast
 * and forgetting the update are different things, and only the first is what
 * the x means.
 */
export function dismissUpdate(): void {
  dismissed = true;
  notify();
}

function notify(): void {
  const visible = needsRefresh && !dismissed;
  listeners.forEach((l) => l(visible));
}

/**
 * Whether a reload right now would cost the user nothing. Every shot is already
 * persisted and the session id is in the hash, so anywhere off the Active tab,
 * with no keyboard up and no session being started, qualifies.
 */
export function setUpdateSafe(safe: boolean): void {
  updateSafe = safe;
  maybeAutoApply();
}

export function setUpdateFn(fn: (reload?: boolean) => Promise<void>): void {
  updateFn = fn;
}

/** Kept so `checkForUpdate` has something to ask. */
export function setRegistration(r: ServiceWorkerRegistration): void {
  registration = r;
}

export function applyUpdate(): Promise<void> | undefined {
  return updateFn?.(true);
}

/**
 * Ask the browser whether a newer worker exists. Only a check: if one is found,
 * workbox fires `waiting`, which lands here as `setNeedsRefresh(true)` and goes
 * through the same safety rule as everything else.
 */
export function checkForUpdate(): Promise<void> {
  return registration?.update().then(() => {}).catch(() => {}) ?? Promise.resolve();
}

/**
 * An installed app can sit in the background for weeks. Returning to the
 * foreground is the moment to look for a new worker; without this, a user who
 * never fully closes the app never learns there is one.
 */
export function initForegroundUpdateCheck(doc: Document = document): () => void {
  const onVisible = () => {
    if (doc.visibilityState === "visible") void checkForUpdate();
  };
  doc.addEventListener("visibilitychange", onVisible);
  return () => doc.removeEventListener("visibilitychange", onVisible);
}

/**
 * A crash caused by a shell older than the database it opened. Dexie throws
 * `VersionError` when the stored version is newer than the one this build
 * declares, and the tail of that failure surfaces as a closed or unknown
 * database. None of them are fixed by reloading the same stale shell.
 */
export function isStaleShellError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  return name === "VersionError" || name === "DatabaseClosedError" || name === "UnknownError";
}

export function subscribeNeedsRefresh(fn: Listener): () => void {
  listeners.add(fn);
  fn(needsRefresh && !dismissed);
  return () => listeners.delete(fn);
}

/** Tests only: the module holds page-lifetime state by design. */
export function resetUpdateState(): void {
  needsRefresh = false;
  dismissed = false;
  updateSafe = false;
  applied = false;
  updateFn = null;
  registration = null;
  listeners.clear();
}
