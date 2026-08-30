import { CircleDot, MapPin, Target, Waves, type LucideIcon } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { GROUP_HEADING } from "./ui/typography";
import { TAP_TARGET_44 } from "./ui/Chip";
import { nextSteps, type NextStepKey } from "../lib/onboarding";
import { dismissNextStep, getOnboardingFacts } from "../services/onboardingRepository";

interface NextStepsProps {
  onOpenArsenal: () => void;
  onOpenSpareLines: () => void;
  onOpenOilPatterns: () => void;
  onOpenLaneNotes: () => void;
}

interface StepCopy {
  icon: LucideIcon;
  /** What the step gets you, then why it is worth the minute. */
  title: string;
  description: string;
  action: string;
}

const COPY: Record<NextStepKey, StepCopy> = {
  arsenal: {
    icon: CircleDot,
    title: "Add the balls you throw",
    description:
      "Every shot is recorded against a ball, so lines, drift and carry are all read back per ball.",
    action: "Add a ball"
  },
  "spare-lines": {
    icon: Target,
    title: "Write down your spare lines",
    description:
      "Once a leave has a line saved, that line comes up on the shot bar the moment you get that leave.",
    action: "Set spare lines"
  },
  "oil-pattern": {
    icon: Waves,
    title: "Add the pattern you bowl on",
    description: "Stats filter by pattern, so nights on the same oil compare against each other.",
    action: "Add a pattern"
  },
  "lane-notes": {
    icon: MapPin,
    title: "Note what a lane does",
    description:
      "You keep going back to the same house. What its lanes do is worth writing down once.",
    action: "Add a lane note"
  }
};

/**
 * Setup steps the user's own data says are still worth doing, at most two at a
 * time (`nextSteps`). It renders nothing when there is nothing to suggest,
 * which is the normal state, so Home is not permanently carrying a chore list.
 *
 * Shaped like the install and backup banners rather than like list rows: each
 * step is a sentence with a way to act on it and a way to wave it off, and §4
 * reserves the single-tap row for opening a thing.
 */
export function NextSteps({
  onOpenArsenal,
  onOpenSpareLines,
  onOpenOilPatterns,
  onOpenLaneNotes
}: NextStepsProps) {
  const facts = useLiveQuery(() => getOnboardingFacts());
  // Nothing until the counts are in. A card that appears and then retracts as
  // the queries land is worse than one that arrives a frame late.
  const steps = facts ? nextSteps(facts) : [];
  if (steps.length === 0) return null;

  const open: Record<NextStepKey, () => void> = {
    arsenal: onOpenArsenal,
    "spare-lines": onOpenSpareLines,
    "oil-pattern": onOpenOilPatterns,
    "lane-notes": onOpenLaneNotes
  };

  return (
    <div className="mt-6">
      <h2 className={`${GROUP_HEADING} mb-2`}>Next steps</h2>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const copy = COPY[step];
          return (
            <li
              key={step}
              className="flex gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <copy.icon size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{copy.title}</p>
                <p className="mt-0.5 text-xs text-ink-secondary">{copy.description}</p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={open[step]}
                    className={`relative text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
                  >
                    {copy.action}
                  </button>
                  <button
                    type="button"
                    onClick={() => void dismissNextStep(step)}
                    className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold text-ink-secondary hover:underline ${TAP_TARGET_44}`}
                  >
                    Not now
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
