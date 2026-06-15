import { useEffect, useState } from "react";
import { SessionHistory } from "../components/SessionHistory";
import { getSessionHistory } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
}

export function HistoryView({ onOpenSession, activeSessionId }: HistoryViewProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const history = await getSessionHistory();
        if (isMounted) setSessions(history);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load history.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">History</h1>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <SessionHistory
        sessions={sessions}
        isLoading={isLoading}
        onOpenSession={onOpenSession}
        activeSessionId={activeSessionId}
      />
    </section>
  );
}
