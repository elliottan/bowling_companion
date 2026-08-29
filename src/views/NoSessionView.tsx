import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { SessionFormDialog } from "../components/SessionFormDialog";
import type { NewSessionFormValues } from "../components/SessionForm";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";

interface NoSessionViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting: boolean;
  error: string;
}

/**
 * The Active tab with nothing in progress. The tab used to be disabled in the
 * bar, which is a dead control that explains nothing: a tab bar is a set of
 * places, and a place you cannot go reads as a fault. It is a place with
 * nothing in it, so it says so and offers the way out (DESIGN-LANGUAGE §5).
 */
export function NoSessionView({ onStartSession, isSubmitting, error }: NoSessionViewProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="mx-auto w-full max-w-xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <h1 className="mb-3 text-xl font-bold text-ink">Active</h1>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <EmptyState
        icon={PlayCircle}
        title="No session running"
        description="Start a session and you score it here, shot by shot."
      >
        <Button variant="primary" onClick={() => setShowForm(true)}>
          Start a session
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
