import { BookOpen, CircleDot, Compass, MapPin, PlayCircle, Plus, Smartphone, Spline, Waves, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { GROUP_HEADING } from "../components/ui/typography";
import { Fab, FabRow } from "../components/ui/Fab";
import { SessionHistory } from "../components/SessionHistory";
import { InstallPrompt } from "../components/InstallPrompt";
import { NextSteps } from "../components/NextSteps";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { NewSessionFormValues } from "../components/SessionForm";
import {
  getBackupNudgeState,
  getSessionList,
  getSetting,
  setBackupNudgeSnoozedUntil,
  setSetting,
  type ResumableGame
} from "../services/bowlingRepository";
import { backupUrgency as urgencyOf, describeAge, snoozeMs } from "../lib/backupNudge";
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
  onOpenGamePlan: () => void;
  onOpenSpareLines: () => void;
  onSessionDeleted?: (sessionId: number) => void;
  onOpenBackup: () => void;
}

const INSTALL_NUDGE_DISMISSED_KEY = "install_nudge_dismissed_at";

const RECENT_LIMIT = 10;

// A stable empty list: `?? []` would be a new array on every render.
const NO_SESSIONS: SessionSummary[] = [];

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
  onOpenGamePlan,
  onOpenSpareLines,
  onSessionDeleted,
  onOpenBackup
}: DashboardViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(false);

  // Live: finishing a game, deleting a session or importing a backup all show
  // up here without the dashboard being told to reload.
  // Ten rows, so it takes the loader that skips scored games' frames: the full
  // one pulled every frame of every night ever bowled to render this (ADR-066).
  const liveRecent = useLiveQuery(async () => (await getSessionList()).slice(0, RECENT_LIMIT));
  const recent = liveRecent ?? NO_SESSIONS;
  const loadingRecent = liveRecent === undefined;
  // Nothing ever bowled on this device. The recent list is the whole history
  // when it is under the limit, so no extra count is needed to know that.
  const coldStart = !loadingRecent && recent.length === 0;

  const nudge = useLiveQuery(() => getBackupNudgeState());
  // Read once per render rather than stored: the display mode can change under
  // a live tab (the user installs mid-session) and this costs a matchMedia.
  const installed = isStandalone();
  const backupUrgency = nudge ? urgencyOf(nudge, installed) : "none";
  const nudgeSessionsSince = nudge
    ? nudge.lastBackupAt === null
      ? nudge.totalSessions
      : nudge.totalSessions - nudge.sessionsAtLastBackup
    : 0;
  const backupAge = nudge ? describeAge(nudge.lastBackupAt, nudge.now) : "never";

  // Wrapped in an object because the setting is itself undefined when unset,
  // which would otherwise be indistinguishable from "the query has not
  // answered yet" and flash the banner on every load.
  const installNudge = useLiveQuery(async () => ({
    dismissedAt: await getSetting(INSTALL_NUDGE_DISMISSED_KEY)
  }));
  const installEligible = (isIOSSafari() && !installed) || canPromptInstall();
  const showInstallLine = installEligible && !!installNudge && !installNudge.dismissedAt;

  function handleBackupLater() {
    void setBackupNudgeSnoozedUntil(new Date(Date.now() + snoozeMs(installed)).toISOString());
  }

  // Both nudges dismiss by writing the setting they read: the live queries
  // above pick the write up, so there is no second copy of "is it showing".
  function dismissInstallLine() {
    void setSetting(INSTALL_NUDGE_DISMISSED_KEY, new Date().toISOString());
  }

  async function handleSubmit(values: NewSessionFormValues) {
    await onStartSession(values);
    setShowForm(false);
  }

  // Shortcuts. Icon and name only: these are places the user already knows, so
  // a sentence of description each only cost vertical space.
  // Six of them, which is two even rows of three. Spare lines is not here any
  // more: it lives in the Stats tab's menu alongside Open frames (ADR-063).
  // Game plan is, because it is read before a session and Home is where you are
  // then (ADR-064).
  const shortcuts: Array<{ icon: LucideIcon; label: string; onClick: () => void }> = [
    { icon: Compass, label: "Game plan", onClick: onOpenGamePlan },
    { icon: CircleDot, label: "Arsenal", onClick: onOpenArsenal },
    { icon: BookOpen, label: "Catalog", onClick: onOpenCatalog },
    { icon: Spline, label: "Line", onClick: onOpenLineVisualizer },
    { icon: MapPin, label: "Lane notes", onClick: onOpenLaneNotes },
    { icon: Waves, label: "Oil patterns", onClick: onOpenOilPatterns }
  ];

  return (
    <section className={`mx-auto w-full max-w-xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5 ${resumable ? "pb-44" : ""}`}>
      <h1 className="mb-3 text-xl font-bold text-ink">Home</h1>

      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {/* Two separate warnings about two separate risks, and neither is
          nested inside the other. The install line used to render inside the
          backup nudge, so the one message that actually protects an iPhone
          user's data was invisible to anyone who backed up regularly, and gone
          for anyone who kept snoozing (ADR-067). */}
      {showInstallLine && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
          <Smartphone size={18} aria-hidden="true" className="shrink-0" />
          <button
            type="button"
            onClick={() => setInstallPromptOpen(true)}
            className={`relative flex-1 text-left text-xs font-bold underline hover:no-underline ${TAP_TARGET_44}`}
          >
            Add to your home screen. Your scores live only on this device, and an
            uninstalled browser tab can clear them after 7 days.
          </button>
          <button
            type="button"
            onClick={dismissInstallLine}
            className={`relative shrink-0 text-xs font-semibold text-warning-700/80 hover:underline ${TAP_TARGET_44}`}
          >
            Dismiss
          </button>
        </div>
      )}

      {backupUrgency !== "none" && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            backupUrgency === "overdue"
              ? "border-danger-200 bg-danger-50 text-danger-700"
              : "border-warning-200 bg-warning-50 text-warning-700"
          }`}
        >
          <p className="font-semibold">
            {nudgeSessionsSince} {nudgeSessionsSince === 1 ? "session" : "sessions"} not backed
            up. Last backup: {backupAge}.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenBackup}
              className={`relative text-xs font-bold underline hover:no-underline ${TAP_TARGET_44}`}
            >
              Back up now
            </button>
            {/* Overdue has no Later. A reminder that can be dismissed for ever
                never reaches the person who most needs it. */}
            {backupUrgency === "due" && (
              <button
                type="button"
                onClick={handleBackupLater}
                className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold opacity-80 hover:underline ${TAP_TARGET_44}`}
              >
                Later
              </button>
            )}
          </div>
        </div>
      )}

      {/* A device that has never scored a game gets told what the app is
          before it gets a grid of six places it has not been. The grid stays
          below rather than waiting for the first session: it is the only route
          to the catalog and the line visualiser, and a new bowler with no balls
          is exactly who needs them (DESIGN-LANGUAGE §5). */}
      {coldStart && (
        <EmptyState
          icon={PlayCircle}
          title="Score your first night"
          description="Start a session and tap in each shot. Your scores, lines and stats stay on this device."
        >
          <Button variant="primary" onClick={() => setShowForm(true)}>
            Start a session
          </Button>
        </EmptyState>
      )}

      <div className={`grid grid-cols-3 gap-2 sm:grid-cols-6 ${coldStart ? "mt-6" : ""}`}>
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

      <NextSteps
        onOpenArsenal={onOpenArsenal}
        onOpenSpareLines={onOpenSpareLines}
        onOpenOilPatterns={onOpenOilPatterns}
        onOpenLaneNotes={onOpenLaneNotes}
      />

      {!coldStart && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className={GROUP_HEADING}>Recent sessions</h2>
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
            onSessionDeleted={onSessionDeleted}
          />
        </div>
      )}

      <FabRow>
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
        <Fab icon={Plus} label="Start new session" onClick={() => setShowForm(true)} />
      </FabRow>

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
