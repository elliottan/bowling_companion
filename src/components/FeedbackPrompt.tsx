import { MessageSquare } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { TAP_TARGET_44 } from "./ui/Chip";
import { shouldAskForFeedback } from "../lib/feedbackPrompt";
import { dismissFeedbackPrompt, getFeedbackPromptFacts } from "../services/onboardingRepository";
import { openFeedbackEmail } from "../lib/diagnostics";

/**
 * The one time Headpin asks what a bowler thinks, after three nights out.
 *
 * The Settings row catches people who already have a complaint. This catches
 * the quiet majority who would never go looking for it, and those are the ones
 * whose reasons for drifting away the app can never otherwise learn: there is
 * no analytics, by design, so asking is the only instrument there is.
 *
 * Shaped like a Next steps card, and dismissed for good either way (opening the
 * form counts as answering, ADR-069).
 */
export function FeedbackPrompt() {
  const facts = useLiveQuery(() => getFeedbackPromptFacts());
  // Nothing until the count is in, so the card never appears and retracts.
  if (!facts || !shouldAskForFeedback(facts.sessionCount, facts.done)) return null;

  const done = () => void dismissFeedbackPrompt();

  return (
    <div className="mt-6 flex gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <MessageSquare size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">How is Headpin treating you?</p>
        <p className="mt-0.5 text-xs text-ink-secondary">
          A few nights in. Tell me what is missing, or what gets in your way.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              done();
              void openFeedbackEmail();
            }}
            className={`relative text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
          >
            Tell me
          </button>
          <button
            type="button"
            onClick={done}
            className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold text-ink-secondary hover:underline ${TAP_TARGET_44}`}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
