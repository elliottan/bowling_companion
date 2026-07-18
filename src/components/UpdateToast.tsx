import { useEffect, useState } from "react";
import { applyUpdate, setNeedsRefresh, subscribeNeedsRefresh } from "../lib/swUpdate";

/**
 * Bottom toast shown when a new service worker is waiting (registerType:
 * "prompt" — we never auto-swap mid-game). Sits above the mobile tab bar
 * (h-16 + safe-area-inset-bottom) and below the arsenal sheet / modals.
 */
export function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeNeedsRefresh(setVisible), []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[50] flex justify-center px-3"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-white shadow-xl">
        <p className="flex-1 text-sm font-medium">Update available</p>
        <button
          type="button"
          onClick={() => applyUpdate()}
          className="inline-flex h-8 items-center rounded-lg bg-felt-700 px-3 text-sm font-bold text-white"
        >
          Update
        </button>
        <button
          type="button"
          onClick={() => setNeedsRefresh(false)}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
