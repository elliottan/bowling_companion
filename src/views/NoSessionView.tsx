import { t } from "@lingui/core/macro";
import { TAB_TITLE, TAB_TITLE_ROW } from "../components/ui/typography";
import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { SessionFormDialog } from "../components/SessionFormDialog";
import type { NewSessionFormValues } from "../components/SessionForm";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";

interface NoSessionViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  /** Start scoring with nothing filled in (ADR-080). */
  onScoreNow: () => Promise<void> | void;
  isSubmitting: boolean;
  error: string;
}

/**
 * The Active tab with nothing in progress. The tab used to be disabled in the
 * bar, which is a dead control that explains nothing: a tab bar is a set of
 * places, and a place you cannot go reads as a fault. It is a place with
 * nothing in it, so it says so and offers the way out (DESIGN-LANGUAGE §5).
 */
export function NoSessionView({ onStartSession, onScoreNow, isSubmitting, error }: NoSessionViewProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="mx-auto w-full max-w-xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <div className={`${TAB_TITLE_ROW} mb-3`}>
        <h1 className={TAB_TITLE}>{t`Score`}</h1>
      </div>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <EmptyState
        icon={PlayCircle}
        title={t`No session running`}
        description={t`Start a session and you score it here, shot by shot.`}
      >
        <Button variant="primary" onClick={() => setShowForm(true)}>
          {t`Start session`}
        </Button>
        {/* The way past the form for a bowler who is already standing at the
            lane. The alley and the rest can be filled in afterwards. */}
        <Button variant="ghost" disabled={isSubmitting} onClick={() => void onScoreNow()}>
          {t`Score now, add details later`}
        </Button>
      </EmptyState>

      <SessionFormDialog
        open={showForm}
        onSubmit={async (values) => {
          await onStartSession(values);
          setShowForm(false);
        }}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
      />
    </section>
  );
}
