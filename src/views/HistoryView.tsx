import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SessionHistory } from "../components/SessionHistory";
import { deleteSession, getSessionHistory } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
  onSessionDeleted?: (sessionId: number) => void;
}

export function HistoryView({ onOpenSession, activeSessionId, onSessionDeleted }: HistoryViewProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setSessions(await getSessionHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteSession(id);
      onSessionDeleted?.(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete session.");
    }
  }

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
        onRequestDelete={(id, label) => setPendingDelete({ id, label })}
        activeSessionId={activeSessionId}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete session?"
        message={
          pendingDelete
            ? `"${pendingDelete.label}" and all its games will be permanently deleted.`
            : undefined
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
