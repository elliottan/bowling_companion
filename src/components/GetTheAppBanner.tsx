import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { useProAction } from "./ui/useProAction";
import { isIOSSafari, isStandalone } from "../lib/installPrompt";
import type { LockedProAccess } from "../lib/pro";
import { useProAccess } from "../lib/useProAccess";
import { getSetting, setSetting } from "../services/bowlingRepository";

export const GET_APP_DISMISSED_KEY = "get_app_banner_dismissed_at";

/** Waved away, it comes back after this long (DESIGN-LANGUAGE §4d: a hint is a
 *  snooze with an end, not a permanent no). */
export const GET_APP_SNOOZE_DAYS = 14;

/**
 * The row at the top of Home on the free web app that offers the iPhone app
 * (ADR-170), drawn the way a store's own banner is: a close, the app's icon and
 * name, and Get. It replaced the card asking a web bowler to add the page to
 * the home screen: the app is where games are kept safe now.
 *
 * It is only where there is an app to get: the free web app (not the owner's
 * copy at /score, and not inside the app), not on Android until the app is on
 * Google Play, and not in iOS Safari once the app is listed, where Safari draws
 * its own banner for it (ADR-159). Before the app is listed it says it is
 * coming, with no button to press.
 */
export function GetTheAppBanner({ userAgent }: { userAgent?: string } = {}) {
  const access = useProAccess();
  if (!access.locked || !("appStoreUrl" in access)) return null;
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  if (/Android/i.test(ua)) return null;
  if (access.appStoreUrl && isIOSSafari() && !isStandalone()) return null;
  return <Banner access={access} />;
}

function Banner({ access }: { access: LockedProAccess }) {
  const action = useProAction(access);
  // Wrapped, so the query not having answered yet (undefined) is told apart
  // from a banner that was never waved away, and it does not flash in.
  const snooze = useLiveQuery(async () => {
    const at = await getSetting(GET_APP_DISMISSED_KEY);
    const until = at ? new Date(at).getTime() + GET_APP_SNOOZE_DAYS * 24 * 60 * 60 * 1000 : 0;
    return { snoozed: until > Date.now() };
  });
  if (!snooze || snooze.snoozed) return null;

  return (
    <aside
      aria-label="Headpin for iPhone"
      className="mb-3 flex items-center gap-2 rounded-xl border border-edge bg-surface py-1.5 pl-1 pr-2 shadow-sm"
    >
      <IconButton
        compact
        label="Not now"
        onClick={() => void setSetting(GET_APP_DISMISSED_KEY, new Date().toISOString())}
      >
        <X size={16} aria-hidden="true" />
      </IconButton>
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px] shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">Headpin for iPhone</p>
        <p className="truncate text-xs text-ink-secondary">
          {action.unavailable ? "Coming soon to the App Store" : "Free on the App Store"}
        </p>
      </div>
      {!action.unavailable && (
        <Button variant="primary" onClick={action.start} className="shrink-0 rounded-full px-5">
          Get
        </Button>
      )}
      {action.dialog}
    </aside>
  );
}
