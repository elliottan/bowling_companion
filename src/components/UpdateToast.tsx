import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { applyUpdate, dismissUpdate, subscribeNeedsRefresh } from "../lib/swUpdate";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

/**
 * Bottom toast shown when a new service worker is waiting and the app is
 * somewhere a reload would cost something, which in practice is the Active tab
 * (`lib/swUpdate.ts` applies the update by itself everywhere else). Sits above
 * the mobile tab bar (h-16 + safe-area-inset-bottom) and below the arsenal
 * sheet and modals.
 */
export function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeNeedsRefresh(setVisible), []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[50] flex justify-center px-3"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-ink px-4 py-3 text-surface shadow-xl">
        <p className="flex-1 text-sm font-medium">Update available</p>
        <Button variant="primary" onClick={() => applyUpdate()}>
          Update
        </Button>
        <IconButton variant="inverse" onClick={() => dismissUpdate()} label="Dismiss">
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
