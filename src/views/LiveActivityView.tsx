import { t } from "@lingui/core/macro";
import { useMemo, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Smartphone } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { ListGroup, ListSwitchRow } from "../components/ui/ListGroup";
import { ProVeil } from "../components/ui/ProLock";
import {
  IslandPreview,
  LockScreenPreview,
  WatchPreview
} from "../components/LiveActivityPreviews";
import { sampleLiveActivityState } from "../lib/liveActivitySample";
import { getLiveActivityEnabled, setLiveActivityEnabled } from "../services/bowlingRepository";
import type { LiveActivityStatus } from "../lib/nativeLiveActivity";

/**
 * The Live Activity's page in Settings (ADR-244): what it shows and where, in
 * pictures of the three places it is drawn, with the switch above them. Pro:
 * without it the switch is veiled and opens the Pro page, and the pictures
 * stay, since they are what the bowler would get.
 */
export function LiveActivityView({ status, onBack }: { status: LiveActivityStatus; onBack: () => void }) {
  const on = useLiveQuery(getLiveActivityEnabled, [], undefined);
  // Built once a visit: the app's palette and theme do not change under it.
  const sample = useMemo(() => sampleLiveActivityState(), []);

  return (
    <PushScreen mode="inline" title={t`Live Activity`} onBack={onBack}>
      <section className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
        <p className="px-1 text-subhead text-ink-secondary">
          {t`Your game follows you off the screen. From the first ball, the score is on your Lock Screen, in the Dynamic Island and on your Apple Watch, and it changes with every ball you enter.`}
        </p>

        <div className="space-y-2">
          <ProVeil what={t`Enable Live Activity`} label={t`Turn on with Pro`}>
            <ListGroup>
              <ListSwitchRow
                icon={Smartphone}
                label={t`Enable Live Activity`}
                checked={on ?? true}
                onChange={(next) => void setLiveActivityEnabled(next)}
              />
            </ListGroup>
          </ProVeil>
          {!status.enabled && (
            <p role="status" className="px-4 text-footnote text-ink-secondary">
              {t`Switched off for Headpin in the iPhone's Settings`}
            </p>
          )}
        </div>

        <ul className="space-y-3">
          <Place
            title={t`On the Lock Screen`}
            why={t`Your total, the frame you're on and the best score still possible, over all ten frames as your scorecard shows them. Pick up the phone between balls and it's there.`}
          >
            <LockScreenPreview state={sample} />
          </Place>
          <Place
            title={t`In the Dynamic Island`}
            why={t`While you're in another app, your total sits at the top of the screen. Touch and hold it to see the frame you're on and the last four frames.`}
          >
            <IslandPreview state={sample} />
          </Place>
          <Place
            title={t`On your Apple Watch`}
            why={t`Leave the phone on the ball return. Your watch's Smart Stack shows the game, your total and the last three frames.`}
          >
            <WatchPreview state={sample} />
          </Place>
        </ul>
      </section>
    </PushScreen>
  );
}

/** One place the activity is drawn: its picture, then what it shows there. */
function Place({ title, why, children }: { title: string; why: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      {children}
      <h3 className="mt-3 text-headline text-ink">{title}</h3>
      <p className="mt-0.5 text-subhead text-ink-secondary">{why}</p>
    </li>
  );
}
