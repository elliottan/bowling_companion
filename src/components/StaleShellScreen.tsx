import { useState } from "react";
import { applyUpdate, checkForUpdate } from "../lib/swUpdate";
import { Button } from "./ui/Button";

/** How long to wait for the waiting worker to take over before reloading
 *  anyway. `updateSW(true)` only sends SKIP_WAITING and rides workbox's
 *  `controlling` event, which never fires when another tab still holds the old
 *  worker; the plain reload is the way out of that. */
const TAKEOVER_GRACE_MS = 1500;

/**
 * The database on this device is newer than the shell that just opened it,
 * which happens when a tab has been left open across a deploy. It is not a
 * crash the bowler caused and nothing of theirs is at risk, so it says so and
 * offers the one move that fixes it.
 */
export function StaleShellScreen() {
  const [busy, setBusy] = useState(false);

  function handleUpdate() {
    setBusy(true);
    void checkForUpdate()
      .then(() => applyUpdate())
      .catch(() => {});
    window.setTimeout(() => window.location.reload(), TAKEOVER_GRACE_MS);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-ink">
      <h1 className="text-lg font-semibold">Headpin needs to update</h1>
      <p className="max-w-sm text-sm text-ink-secondary">
        This tab is running an older version of the app than your scores were
        saved with. Everything is still on this device.
      </p>
      <Button variant="primary" onClick={handleUpdate} disabled={busy}>
        {busy ? "Updating…" : "Reload"}
      </Button>
    </div>
  );
}
