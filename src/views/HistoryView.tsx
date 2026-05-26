import { useEffect, useState } from "react";
import { SessionHistory } from "../components/SessionHistory";
import { getSessionHistory } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
}

export function HistoryView({ onOpenSession }: HistoryViewProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      setIsLoading(true);
      setError("");

      try {
        const history = await getSessionHistory();

        if (isMounted) {
          setSessions(history);
        }
      } catch (historyError) {
        if (isMounted) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "Unable to load session history."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-felt-700">
          Session history
        </p>
        <h1 className="text-3xl font-bold text-slate-950">Past sessions</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Review locally saved sessions, games, frame counts, and final scores.
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <SessionHistory
        sessions={sessions}
        isLoading={isLoading}
        onOpenSession={onOpenSession}
      />
    </section>
  );
}
