import { BookOpen, PlayCircle, Plus, Smartphone, Spline } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionHistory } from "../components/SessionHistory";
import { InstallPrompt } from "../components/InstallPrompt";
import { Button } from "../components/ui/Button";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { NewSessionFormValues } from "../components/SessionForm";
import {
  getBackupNudgeState,
  getSessionHistory,
  getSetting,
  setBackupNudgeSnoozedUntil,
  setSetting,
  type ResumableGame
} from "../services/bowlingRepository";
import { shouldShowBackupNudge } from "../lib/backupNudge";
import { canPromptInstall, isIOSSafari, isStandalone } from "../lib/installPrompt";
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
  onOpenCatalog: () => void;
  onOpenLineVisualizer: () => void;
  onSessionDeleted?: (sessionId: number) => void;
  onOpenBackup: () => void;
}

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const INSTALL_NUDGE_DISMISSED_KEY = "install_nudge_dismissed_at";

const RECENT_LIMIT = 10;

export function DashboardView({
  onStartSession,
  isSubmitting = false,
  error,
  resumable,
  onResume,
  onOpenSession,
  onViewAll,
  activeSessionId,
  onOpenCatalog,
  onOpenLineVisualizer,
  onSessionDeleted,
  onOpenBackup
}: DashboardViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [showBackupNudge, setShowBackupNudge] = useState(false);
  const [nudgeSessionsSince, setNudgeSessionsSince] = useState(0);
  const [nudgeNeverBackedUp, setNudgeNeverBackedUp] = useState(false);
  const [showInstallLine, setShowInstallLine] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(false);

  const loadBackupNudge = useCallback(async () => {
    try {
      const state = await getBackupNudgeState();
      setShowBackupNudge(shouldShowBackupNudge(state));
      setNudgeSessionsSince(state.totalSessions - state.sessionsAtLastBackup);
      setNudgeNeverBackedUp(state.lastBackupAt === null);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    loadBackupNudge();
  }, [loadBackupNudge]);

  useEffect(() => {
    const eligible = (isIOSSafari() && !isStandalone()) || canPromptInstall();
    if (!eligible) return;
    getSetting(INSTALL_NUDGE_DISMISSED_KEY)
      .then((dismissed) => setShowInstallLine(!dismissed))
      .catch(() => {});
  }, []);

  function handleBackupLater() {
    setShowBackupNudge(false);
    void setBackupNudgeSnoozedUntil(new Date(Date.now() + SNOOZE_MS).toISOString());
  }

  function dismissInstallLine() {
    setShowInstallLine(false);
    void setSetting(INSTALL_NUDGE_DISMISSED_KEY, new Date().toISOString());
  }

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
    <section className={`mx-auto w-full max-w-xl px-3 py-5 sm:px-6 sm:py-8 ${resumable ? "pb-44" : ""}`}>
      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {showBackupNudge && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
          <p>
            {nudgeNeverBackedUp
              ? `${nudgeSessionsSince} sessions, never backed up.`
              : `${nudgeSessionsSince} sessions since your last backup.`}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenBackup}
              className={`relative text-xs font-bold text-warning-700 underline hover:no-underline ${TAP_TARGET_44}`}
            >
              Export backup
            </button>
            <button
              type="button"
              onClick={handleBackupLater}
              className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold text-warning-700/80 hover:underline ${TAP_TARGET_44}`}
            >
              Later
            </button>
          </div>
          {showInstallLine && (
            <div className="mt-2 flex items-center gap-3 border-t border-warning-200 pt-2">
              <button
                type="button"
                onClick={() => setInstallPromptOpen(true)}
                className={`relative inline-flex items-center gap-1 text-xs font-bold text-warning-700 underline hover:no-underline ${TAP_TARGET_44}`}
              >
                <Smartphone size={12} aria-hidden="true" />
                Installing the app protects your data from 7-day cleanup
              </button>
              <button
                type="button"
                onClick={dismissInstallLine}
                className={`relative text-xs font-semibold text-warning-700/80 hover:underline ${TAP_TARGET_44}`}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <Button variant="primary" size="lg" onClick={() => setShowForm(true)} className="w-full">
        <Plus size={18} aria-hidden="true" />
        Start new session
      </Button>

      {/* Widgets row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onOpenCatalog}
          aria-label="Ball Catalog"
          className="flex flex-col items-start gap-2 rounded-lg border border-edge bg-surface p-4 shadow-sm hover:border-accent-fill text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <BookOpen size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">Ball Catalog</span>
            <span className="block text-xs text-ink-secondary">Browse all manufacturer balls</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenLineVisualizer}
          aria-label="Line Visualizer"
          className="flex flex-col items-start gap-2 rounded-lg border border-edge bg-surface p-4 shadow-sm hover:border-accent-fill text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Spline size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">Line Visualizer</span>
            <span className="block text-xs text-ink-secondary">Sketch a line on the lane</span>
          </span>
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-secondary">Recent sessions</h2>
          {recent.length > 0 && (
            <Button variant="ghost" onClick={onViewAll}>
              View all
            </Button>
          )}
        </div>
        <SessionHistory
          sessions={recent}
          isLoading={loadingRecent}
          onOpenSession={onOpenSession}
          activeSessionId={activeSessionId}
          onSessionChanged={loadRecent}
          onSessionDeleted={onSessionDeleted}
        />
      </div>

      {/* Floating "resume" pill — hovers above the page, just over the bottom
          nav, so the currently active session is always one tap away. */}
      {resumable && (
        <button
          type="button"
          onClick={onResume}
          className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-accent-fill bg-accent-fill p-4 text-left text-accent-on-fill shadow-2xl hover:bg-accent-fill-hover sm:bottom-6"
        >
          <PlayCircle size={22} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Resume game</span>
            <span className="block truncate text-xs text-accent-on-fill">
              {resumable.alleyName} · Game {resumable.gameNumber}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent-on-fill">Resume →</span>
        </button>
      )}

      <SessionFormDialog
        open={showForm}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
      />

      <InstallPrompt open={installPromptOpen} onClose={() => setInstallPromptOpen(false)} />
    </section>
  );
}
