import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { ProMark } from "../components/ui/ProMark";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { useProAction } from "../components/ui/useProAction";
import {
  BallsSample,
  FirstBallSample,
  LayoutSample,
  LeavesSample,
  LineSample,
  StatsSample,
  ThemesSample
} from "../components/ProOfferSamples";
import { useProAccess, useProOwned, useProStoreContext } from "../lib/useProAccess";

/**
 * What Headpin Pro is, before anything charges (ADR-164): a picture and a
 * sentence for each thing it adds, what stays free, and then the one button.
 * The purchase, the steps to move games over from the web and Restore purchase
 * all live here and nowhere else a bowler is asked to pay.
 *
 * The copy is short on purpose and says why each thing is useful, not how it
 * works. The pictures are drawn from the app's own colors with made-up numbers
 * (`ProOfferSamples`), so they follow the theme and cannot go out of date.
 */
interface ProOfferViewProps {
  onBack: () => void;
}

const FEATURES: Array<{ title: string; why: string; sample: ReactNode }> = [
  {
    title: "Charts for every stat",
    why: "Plot any stat by session or by game, not only your average.",
    sample: <StatsSample />
  },
  {
    title: "First ball breakdown",
    why: "How often you hit the pocket, how often the pocket carries, and how often you strike.",
    sample: <FirstBallSample />
  },
  {
    title: "Your leaves",
    why: "The leaves you keep ending up with, and how often you pick each one up.",
    sample: <LeavesSample />
  },
  {
    title: "Ball by ball",
    why: "Pocket, carry and strike rates for each ball, side by side. The Alley report adds what you would average with each ball at an alley.",
    sample: <BallsSample />
  },
  {
    title: "Move your line",
    why: "Drag the laydown, target and breakpoint on the lane and watch the path follow. It works in the line visualizer and on any shot you have scored.",
    sample: <LineSample />
  },
  {
    title: "Edit layouts",
    why: "Change the angles, the pin buffer and your PAP, and see what the ball will do before you drill it.",
    sample: <LayoutSample />
  },
  {
    title: "More colors",
    why: "Ocean, Sunset, Grape and Rose, next to the Felt green.",
    sample: <ThemesSample />
  }
];

export function ProOfferView({ onBack }: ProOfferViewProps) {
  const access = useProAccess();
  return (
    <PushScreen title="Headpin Pro" onBack={onBack}>
      <div className="mx-auto w-full max-w-xl px-3 pb-4 pt-4 sm:px-6">
        <header className="text-center">
          <ProMark size={72} className="mx-auto rounded-2xl shadow-md" />
          <h2 className="mt-3 text-2xl font-bold text-ink">Headpin Pro</h2>
          <p className="mt-1 text-sm text-ink-secondary">You pay once and keep it. No subscription, no account.</p>
        </header>

        <ul className="mt-5 space-y-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
              {f.sample}
              <h3 className="mt-3 text-base font-bold text-ink">{f.title}</h3>
              <p className="mt-0.5 text-sm text-ink-secondary">{f.why}</p>
            </li>
          ))}
        </ul>

        <section className="mt-3 rounded-xl border border-edge bg-surface-muted p-3">
          <h3 className="text-sm font-bold text-ink">What stays free</h3>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Scoring, history, your arsenal, the ball catalog, oil patterns, guides, backup and sharing. None of it is
            behind Pro.
          </p>
        </section>
      </div>

      {/* The button stays in reach while the page scrolls under it. */}
      <div className="sticky bottom-0 border-t border-edge bg-surface-sunken px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-xl">{access.locked ? <Purchase access={access} /> : <Owned />}</div>
      </div>
    </PushScreen>
  );
}

function Purchase({ access }: { access: Extract<ReturnType<typeof useProAccess>, { locked: true }> }) {
  const action = useProAction(access);
  const store = useProStoreContext();
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);

  async function restore() {
    if (!store || restoring) return;
    setRestoring(true);
    setRestored(null);
    try {
      setRestored((await store.restore()) ? "Headpin Pro is restored." : "This Apple ID has not bought Headpin Pro.");
    } catch (err) {
      setRestored(`The App Store did not answer${err instanceof Error && err.message ? `: ${err.message}` : ". Try again in a moment."}`);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={action.busy || action.unavailable}
        onClick={action.start}
      >
        {action.busy ? "Asking the App Store…" : action.label}
      </Button>
      {action.note && (
        <p role="status" className="text-center text-xs text-ink-secondary">
          {action.note}
        </p>
      )}
      {"store" in access && (
        <>
          <button
            type="button"
            onClick={() => void restore()}
            disabled={restoring}
            className="min-h-11 px-3 text-sm font-semibold text-accent active:opacity-60 disabled:opacity-50"
          >
            {restoring ? "Asking the App Store…" : "Restore purchase"}
          </button>
          {restored && (
            <p role="status" className="text-center text-xs text-ink-secondary">
              {restored}
            </p>
          )}
        </>
      )}
      {"appStoreUrl" in access && (
        <p className="text-center text-xs text-ink-secondary">
          {access.appStoreUrl ? "Pro is bought in the iPhone app." : "Pro is bought in the iPhone app, which is not in the App Store yet."}
        </p>
      )}
      {action.dialog}
    </div>
  );
}

function Owned() {
  // Thanks only where Pro is owned (a purchase, or the owner's copy): Pro is
  // also open on Android, where nobody has paid (ADR-164, ADR-167).
  const bought = useProOwned();
  return (
    <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-ink">
      <Check size={18} aria-hidden="true" className="text-accent" />
      {bought ? "You have Headpin Pro. Thanks for the support." : "Everything in Pro is open here."}
    </p>
  );
}
