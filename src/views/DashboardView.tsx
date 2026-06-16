import { PlayCircle } from "lucide-react";
import { SessionForm, type NewSessionFormValues } from "../components/SessionForm";
import type { ResumableGame } from "../services/bowlingRepository";

interface DashboardViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string;
  resumable?: ResumableGame | null;
  onResume?: () => void;
}

export function DashboardView({
  onStartSession,
  isSubmitting = false,
  error,
  resumable,
  onResume
}: DashboardViewProps) {
  return (
    <section className="mx-auto w-full max-w-xl px-3 py-5 sm:px-6 sm:py-8">
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {resumable && (
        <button
          type="button"
          onClick={onResume}
          className="mb-4 flex w-full items-center gap-3 rounded-lg border border-felt-700 bg-felt-700 p-4 text-left text-white shadow-sm hover:bg-felt-500"
        >
          <PlayCircle size={22} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Resume today's game</span>
            <span className="block truncate text-xs text-white/80">
              {resumable.alleyName} · Game {resumable.gameNumber}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/90">Resume →</span>
        </button>
      )}

      <SessionForm onSubmit={onStartSession} isSubmitting={isSubmitting} />
    </section>
  );
}
