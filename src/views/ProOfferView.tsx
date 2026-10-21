import { useState, type ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
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
import { useProAccess, useProStoreContext } from "../lib/useProAccess";

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
    title: "Every stat, over time",
    why: "Spot a slump or a hot streak early. Chart any stat, session by session or game by game.",
    sample: <StatsSample />
  },
  {
    title: "Your first ball, read",
    why: "Pocket, carry and strike side by side, so you can see which one is costing you pins.",
    sample: <FirstBallSample />
  },
  {
    title: "Your leaves",
    why: "The leaves you leave most, and how often you make each one.",
    sample: <LeavesSample />
  },
  {
    title: "Every ball, compared",
    why: "How each ball strikes, carries and spares, and what you would average with each at an alley.",
    sample: <BallsSample />
  },
  {
    title: "Your line, moved",
    why: "Drag your laydown, target and breakpoint on the lane and watch the path change.",
    sample: <LineSample />
  },
  {
    title: "Your layouts, built",
    why: "Dial in a drilling layout and see what the ball will do before you ever drill it.",
    sample: <LayoutSample />
  },
  {
    title: "More colors",
    why: "Four more accent colors for the whole app, in light and dark.",
    sample: <ThemesSample />
  }
];

export function ProOfferView({ onBack }: ProOfferViewProps) {
  const access = useProAccess();
  return (
    <PushScreen title="Headpin Pro" onBack={onBack}>
      <div className="mx-auto w-full max-w-xl px-3 pb-4 pt-4 sm:px-6">
        <header className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-fill/15 text-accent">
            <Sparkles size={24} aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-2xl font-bold text-ink">Headpin Pro</h2>
          <p className="mt-1 text-sm text-ink-secondary">One payment, yours for good. No subscription, no account.</p>
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
          <h3 className="text-sm font-bold text-ink">Always free</h3>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Scoring, history, your arsenal, the ball catalog, oil patterns, guides, backup and sharing. Pro never takes
            those away.
          </p>
        </section>
      </div>

      {/* The button stays in reach while the page scrolls under it. */}
      <div className="sticky bottom-0 border-t border-edge bg-surface-sunken/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
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
      <Button variant="primary" size="lg" className="w-full" disabled={action.busy} onClick={action.start}>
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
        <p className="text-center text-xs text-ink-secondary">Headpin Pro is in the iPhone app.</p>
      )}
      {action.dialog}
    </div>
  );
}

function Owned() {
  return (
    <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-ink">
      <Check size={18} aria-hidden="true" className="text-accent" />
      You have Headpin Pro. Thank you for backing Headpin.
    </p>
  );
}
