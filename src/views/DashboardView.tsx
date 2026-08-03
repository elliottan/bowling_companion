import { BookOpen, CircleDot, MapPin, PlayCircle, Plus, Smartphone, Spline, Waves, type LucideIcon } from "lucide-react";
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
  onOpenArsenal: () => void;
  onOpenLaneNotes: () => void;
  onOpenOilPatterns: () => void;
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
  onOpenArsenal,
  onOpenLaneNotes,
  onOpenOilPatterns,
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

  const shortcuts: Array<{ icon: LucideIcon; label: string; onClick: () => void }> = [
    { icon: CircleDot, label: "Arsenal", onClick: onOpenArsenal },
    { icon: BookOpen, label: "Catalog", onClick: onOpenCatalog },
    { icon: Spline, label: "Line", onClick: onOpenLineVisualizer },
    { icon: MapPin, label: "Lane Notes", onClick: onOpenLaneNotes },
    { icon: Waves, label: "Oil Patterns", onClick: onOpenOilPatterns }
  ];

  return (
    <section className={`mx-auto w-full max-w-xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5 ${resumable ? "pb-44" : ""}`}>
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

      {/* Shortcuts. Icon and name only: these are places the user already
          knows, so a sentence of description each only cost vertical space. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            aria-label={s.label}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-edge bg-surface px-2 py-3 shadow-sm hover:border-accent-fill"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <s.icon size={18} aria-hidden="true" />
            </span>
            <span className="text-center text-xs font-semibold leading-tight text-ink">{s.label}</span>
          </button>
        ))}
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

      {/* Floating row above the tab bar: starting a session is the one action
          this page exists for, so it keeps the thumb corner, and the resume
          pill shares the row to its left rather than replacing it. */}
      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto flex max-w-xl items-center gap-2 sm:bottom-6">
        {resumable && (
          <button
            type="button"
            onClick={onResume}
            className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-accent-fill bg-accent-fill p-3.5 text-left text-accent-on-fill shadow-2xl hover:bg-accent-fill-hover"
          >
            <PlayCircle size={22} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Resume game</span>
              <span className="block truncate text-xs text-accent-on-fill">
                {resumable.alleyName} · Game {resumable.gameNumber}
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowForm(true)}
          aria-label="Start new session"
          className="pointer-events-auto ml-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-accent-on-fill shadow-2xl hover:bg-accent-fill-hover"
        >
          <Plus size={26} aria-hidden="true" />
        </button>
      </div>

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
