import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { X, type LucideIcon } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { IconButton } from "./ui/IconButton";
import { BowlingBallIcon, LanePairIcon, OilPatternIcon, SpareLineIcon } from "./icons";
import { GROUP_HEADING } from "./ui/typography";
import { TAP_TARGET_44 } from "./ui/Chip";
import { nextSteps, type NextStepKey } from "../lib/onboarding";
import { dismissNextStep, getOnboardingFacts } from "../services/onboardingRepository";

interface NextStepsProps {
  onOpenArsenal: () => void;
  onOpenSpareLines: () => void;
  onOpenOilPatterns: () => void;
  onOpenLaneNotes: () => void;
  /** Steps shown at once. Home shows one, so it is one card rather than a
   *  chore list (ADR-115). */
  max?: number;
  /** Steps the screen already asks for in a place of its own. */
  skip?: readonly NextStepKey[];
}

interface StepCopy {
  icon: LucideIcon;
  /** What the step gets you, then why it is worth the minute. */
  title: MessageDescriptor;
  description: MessageDescriptor;
  action: MessageDescriptor;
}

const COPY: Record<NextStepKey, StepCopy> = {
  arsenal: {
    icon: BowlingBallIcon,
    title: msg`Add balls to your bag`,
    description: msg`Once a ball is in your arsenal you can name it on every shot, and the stats split by ball.`,
    action: msg`Add a ball`
  },
  "spare-lines": {
    icon: SpareLineIcon,
    title: msg`Write down your spare lines`,
    description: msg({
      message: "Save a line for a leave, and it prefills the intended line when you leave that spare during score entry.",
      comment: "Bowling terms: a leave is the pins left standing after the first ball; the intended line is where the bowler plans to stand and aim"
    }),
    action: msg`Set spare lines`
  },
  "oil-pattern": {
    icon: OilPatternIcon,
    title: msg({ message: "Add the pattern you bowl on", comment: "Pattern is an oil pattern, the oil laid on the lane" }),
    description: msg`Filter stats by pattern to compare sessions on the same oil.`,
    action: msg`Add a pattern`
  },
  "lane-notes": {
    icon: LanePairIcon,
    title: msg`Note what a lane does`,
    description: msg`You bowl at this alley a lot. Write down how its lanes play, and it'll be here next time.`,
    action: msg`Add a lane note`
  }
};

/**
 * Setup steps the user's own data says are still worth doing, at most two at a
 * time (`nextSteps`). It renders nothing when there is nothing to suggest,
 * which is the normal state, so Home is not permanently carrying a chore list.
 *
 * Shaped like the install and backup banners rather than like list rows: each
 * step is a sentence with a way to act on it and an X to wave it off, and §4
 * reserves the single-tap row for opening a thing.
 */
export function NextSteps({
  onOpenArsenal,
  onOpenSpareLines,
  onOpenOilPatterns,
  onOpenLaneNotes,
  max,
  skip = []
}: NextStepsProps) {
  const facts = useLiveQuery(() => getOnboardingFacts());
  // Nothing until the counts are in. A card that appears and then retracts as
  // the queries land is worse than one that arrives a frame late.
  const steps = facts
    ? nextSteps(facts)
        .filter((step) => !skip.includes(step))
        .slice(0, max)
    : [];
  if (steps.length === 0) return null;

  const open: Record<NextStepKey, () => void> = {
    arsenal: onOpenArsenal,
    "spare-lines": onOpenSpareLines,
    "oil-pattern": onOpenOilPatterns,
    "lane-notes": onOpenLaneNotes
  };

  return (
    <div className="mt-6">
      <h2 className={`${GROUP_HEADING} mb-2 px-4`}>{t({ message: "Next steps", comment: "Heading on Home over setup suggestions" })}</h2>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const copy = COPY[step];
          const title = i18n._(copy.title);
          return (
            <li
              key={step}
              className="flex gap-3 rounded-[22px] bg-surface px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <copy.icon size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-xs text-ink-secondary">{i18n._(copy.description)}</p>
                <button
                  type="button"
                  onClick={open[step]}
                  className={`relative mt-2 text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
                >
                  {i18n._(copy.action)}
                </button>
              </div>
              <IconButton
                label={t`Dismiss: ${title}`}
                onClick={() => void dismissNextStep(step)}
                className="-mr-2 -mt-1.5 text-ink-secondary"
              >
                <X size={16} aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
