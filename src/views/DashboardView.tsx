import { PlayCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionHistory } from "../components/SessionHistory";
import type { NewSessionFormValues } from "../components/SessionForm";
import { getSessionHistory, type ResumableGame } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

interface DashboardViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string;
  resumable?: ResumableGame | null;
  onResume?: () => void;
  onOpenSession: (sessionId: number) => void;
  onViewAll: () => void;
  activeSessionId?: number | null;
}

const RECENT_LIMIT = 10;

export function DashboardView({
  onStartSession,
  isSubmitting = false,
  error,
  resumable,
  onResume,
  onOpenSession,
  onViewAll,
  activeSessionId
}: DashboardViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const all = await getSessionHistory();
      setRecent(all.slice(0, RECENT_LIMIT));
    } catch {
      // best-effort
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  async function handleSubmit(values: NewSessionFormValues) {
    await onStartSession(values);
    setShowForm(false);
  }

  return (
    <section className={`mx-auto w-full max-w-xl px-3 py-5 sm:px-6 sm:py-8 ${resumable ? "pb-32" : ""}`}>
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-felt-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-felt-500"
      >
        <Plus size={18} aria-hidden="true" />
        Start new session
      </button>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent sessions</h2>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-semibold text-felt-700 hover:underline"
            >
              View all
            </button>
          )}
        </div>
        <SessionHistory
          sessions={recent}
          isLoading={loadingRecent}
          onOpenSession={onOpenSession}
          activeSessionId={activeSessionId}
        />
      </div>

      {/* Floating "resume" pill — hovers above the page, just over the bottom
          nav, so the currently active session is always one tap away. */}
      {resumable && (
        <button
          type="button"
          onClick={onResume}
          className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-felt-700 bg-felt-700 p-4 text-left text-white shadow-2xl hover:bg-felt-500 sm:bottom-6"
        >
          <PlayCircle size={22} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Resume game</span>
            <span className="block truncate text-xs text-white/80">
              {resumable.alleyName} · Game {resumable.gameNumber}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/90">Resume →</span>
        </button>
      )}

      <SessionFormDialog
        open={showForm}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
      />
    </section>
  );
}
