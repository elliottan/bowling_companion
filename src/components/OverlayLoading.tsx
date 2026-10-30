import { t } from "@lingui/core/macro";
import { useLayoutEffect } from "react";
import { overlayHandoff } from "../lib/overlayHandoff";
import { PushScreen } from "./PushScreen";
import { Spinner } from "./ui/Spinner";

/**
 * What a pushed screen shows while its code arrives.
 *
 * The first tap on a screen not opened before used to do nothing visible: the
 * chunk was loading, the fallback was empty, and the bowler tapped again, and
 * again. The screen now comes first and the wait happens on it, with a back
 * control, so a tap is always answered and a second one has nothing to hit.
 * It hands its place to the real screen without a second slide
 * (`overlayHandoff`).
 */
export function OverlayLoading({ onBack }: { onBack: () => void }) {
  // Before paint, as its slide starts, so the time is the slide's own.
  useLayoutEffect(() => {
    overlayHandoff.active = true;
    overlayHandoff.since = performance.now();
    return () => {
      overlayHandoff.active = false;
    };
  }, []);

  return (
    <PushScreen title={t`Loading…`} onBack={onBack}>
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    </PushScreen>
  );
}
