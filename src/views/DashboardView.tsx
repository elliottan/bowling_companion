import { plural, t } from "@lingui/core/macro";
import { ChevronRight, PlayCircle, Search, ShieldCheck } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { PinIcon } from "../components/icons";
import { ToolCards } from "../components/ToolCards";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { alleyLabel } from "../lib/sessionLabels";
import { ArsenalRow, HomeHero, ProfileTiles } from "../components/HomeProfile";
import { summarizeHome } from "../lib/homeSummary";
import { BowlerNameSheet } from "../components/BowlerNameSheet";
import { GREETINGS, greeting } from "../lib/greeting";
import { GetTheAppBanner } from "../components/GetTheAppBanner";
import { NextSteps } from "../components/NextSteps";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { NewSessionFormValues } from "../components/SessionForm";
import { activeBalls } from "../lib/arsenal";
import { getBalls } from "../services/ballRepository";
import {
  getBackupNudgeState,
  getBowlerName,
  getSessionList,
  setBackupNudgeSnoozedUntil,
  type ResumableGame
} from "../services/bowlingRepository";
import { describeAge, protectionCard, snoozeMs } from "../lib/backupNudge";
import { isStandalone } from "../lib/installPrompt";
import { nextSteps, type NextStepKey } from "../lib/onboarding";
import { useProOwned } from "../lib/useProAccess";
import { ProMark } from "../components/ui/ProMark";
import { ProHomeBanner } from "../components/ProHomeBanner";
import { getOnboardingFacts } from "../services/onboardingRepository";
import type { SessionSummary } from "../types/bowling";

interface DashboardViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string;
  resumable?: ResumableGame | null;
  onResume?: () => void;
  onOpenCatalog: () => void;
  onOpenLineVisualizer: () => void;
  onOpenLayoutLab: () => void;
  onOpenAlleyReport: () => void;
  onOpenArsenal: () => void;
  onOpenLaneNotes: () => void;
  onOpenOilPatterns: () => void;
  onOpenSpareLines: () => void;
  onOpenGuides: () => void;
  onOpenBackup: () => void;
  /** The search over everything (ADR-247). */
  onOpenSearch?: () => void;
}

/** Next steps Home asks for elsewhere. The arsenal row, while the bag is
 *  empty, already asks for the balls, and a step asking again was the same
 *  card twice. */
const HOME_SKIPPED_STEPS: readonly NextStepKey[] = ["arsenal"];

// A stable empty list: `?? []` would be a new array on every render.
const NO_SESSIONS: SessionSummary[] = [];

export function DashboardView({
  onStartSession,
  isSubmitting = false,
  error,
  resumable,
  onResume,
  onOpenCatalog,
  onOpenLineVisualizer,
  onOpenLayoutLab,
  onOpenAlleyReport,
  onOpenArsenal,
  onOpenLaneNotes,
  onOpenOilPatterns,
  onOpenSpareLines,
  onOpenGuides,
  onOpenBackup,
  onOpenSearch
}: DashboardViewProps) {
  const [showForm, setShowForm] = useState(false);
  const owned = useProOwned();
  const [editingName, setEditingName] = useState(false);
  // Picked once per visit to Home, so the greeting changes between visits but
  // holds still while the screen is up.
  const [greetingIndex] = useState(() => Math.floor(Math.random() * GREETINGS.length));
  // Wrapped, because an unset name is null and the query not having answered
  // yet is undefined, and the greeting should not flash between the two.
  const named = useLiveQuery(async () => ({ name: await getBowlerName() }));
  const name = named?.name ?? null;
  // The bag, not the history: a retired ball is not one the bowler carries.
  const balls = useLiveQuery(async () => activeBalls(await getBalls()));

  // Live: finishing a game, deleting a session or importing a backup all show
  // up here without the dashboard being told to reload. The list loader skips
  // scored games' frames (ADR-066), and the recent alleys need every session,
  // so it is read whole and cut here.
  const liveSessions = useLiveQuery(() => getSessionList());
  const sessions = liveSessions ?? NO_SESSIONS;
  const summary = useMemo(() => summarizeHome(sessions), [sessions]);
  const loadingRecent = liveSessions === undefined;
  const coldStart = !loadingRecent && sessions.length === 0;
  // The alleys the Alley report can pick from: every named one, as typed.
  const alleyCount = liveSessions
    ? new Set(sessions.map(({ session }) => session.alley_name).filter((a) => a.trim())).size
    : undefined;

  const facts = useLiveQuery(() => getOnboardingFacts());

  const nudge = useLiveQuery(() => getBackupNudgeState());
  // Read once per render rather than stored: the display mode can change under
  // a live tab (the user installs mid-session) and this costs a matchMedia.
  const installed = isStandalone();
  const nudgeSessionsSince = nudge
    ? nudge.lastBackupAt === null
      ? nudge.totalSessions
      : nudge.totalSessions - nudge.sessionsAtLastBackup
    : 0;
  const lastBackup = nudge ? describeAge(nudge.lastBackupAt, nudge.now) : t`never`;

  // One card, never two (ADR-115). Home no longer asks a web bowler to add the
  // page to the home screen: the way to keep games is the app now, and the
  // banner at the top of Home offers it (ADR-170). The backup card stays.
  const protection = nudge ? protectionCard(nudge, installed, false) : null;

  function handleBackupLater() {
    void setBackupNudgeSnoozedUntil(new Date(Date.now() + snoozeMs(installed)).toISOString());
  }

  async function handleSubmit(values: NewSessionFormValues) {
    await onStartSession(values);
    setShowForm(false);
  }


  // One prompt on Home at a time (ADR-150): the protection card if one is
  // owed, else a setup step, else the one-time feedback ask. None of them on a
  // device that has never scored, where the first session is the only ask.
  const stepOwed =
    !!facts && nextSteps(facts).some((step) => !HOME_SKIPPED_STEPS.includes(step));
  const setupCard = coldStart || protection ? null : stepOwed ? "step" : "feedback";

  return (
    // Start session is in the hero now, so there is no floating button to
    // clear: `<main>` already pads by the tab bar.
    <section className="mx-auto w-full max-w-xl px-3 pb-4 pt-3 sm:px-6 sm:pt-5">
      <GetTheAppBanner />
      {/* The greeting is the screen's title, on a line of its own with the
          app's mark at its end (ADR-245). It offers a name only while there is
          none: a name is set once, and changing it lives in Settings. */}
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-title-2 font-bold leading-tight tracking-tight text-ink">
            {named ? greeting(name, greetingIndex) : "\u00a0"}
          </h1>
          {named && !name && (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className={`relative mt-1 text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              {t`Add your name`}
            </button>
          )}
        </div>
        {/* The search, round glass beside the mark, where a phone's own
            screens keep theirs: at the top, in reach of the eye before the
            thumb (ADR-247). */}
        {onOpenSearch && (
          <IconButton label={t`Search`} variant="round" onClick={onOpenSearch} className="shrink-0">
            <Search size={20} strokeWidth={2.25} aria-hidden="true" />
          </IconButton>
        )}
        {/* The app's mark, and once this copy has Pro, the Pro mark in its
            place (ADR-167). */}
        {owned ? (
          <ProMark size={40} title="Headpin Pro" className="shrink-0 rounded-xl shadow-sm" />
        ) : (
          <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
        )}
      </div>

      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {/* A game in progress leads the screen, so carrying on is one tap. A new
          session starts from the floating button, and a device that has never
          scored a game is told what the app is first (DESIGN-LANGUAGE §5). */}
      {/* One way in for a bowler who has never scored (ADR-150), and it opens
          the session form: the alley, pattern and lanes are worth having from
          the first game, and every field can still be left blank (ADR-215). */}
      {coldStart ? (
        <EmptyState
          icon={PinIcon}
          title={t`Score your first session`}
        >
          <Button variant="primary" disabled={isSubmitting} onClick={() => setShowForm(true)}>
            {t`Start scoring`}
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {resumable && (
        <button
          type="button"
          onClick={onResume}
          className="flex w-full items-center gap-3 rounded-[22px] bg-accent-fill p-4 text-left text-accent-on-fill active:bg-accent-fill-hover"
        >
          <PlayCircle size={28} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">{t`Resume game`}</span>
            <span className="block truncate text-sm">
              {alleyLabel(resumable.alleyName)} · {t`Game ${{ gameNumber: resumable.gameNumber }}`}
            </span>
          </span>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
        </button>
          )}
          {/* Not before the sessions are read, or it would flash in empty. */}
          {!loadingRecent && (
            <HomeHero summary={summary} onStart={() => setShowForm(true)} disabled={isSubmitting} />
          )}
        </div>
      )}

      {/* The bowler's own things: the arsenal as a row that is plainly a way
          in, then spare lines, lane notes and the Alley report as equal tiles.
          Recent sessions are left to History, which is one tap away: the hero
          already carries the last one (ADR-245). The tools, the same for
          everyone, follow as cards (ADR-146). */}
      <div className="mt-3 space-y-3">
        <ArsenalRow balls={balls} onOpenArsenal={onOpenArsenal} />
        <ProfileTiles
          spareLines={facts?.answeredSpareLines}
          laneNotes={facts?.laneNoteCount}
          alleys={alleyCount}
          onOpenSpareLines={onOpenSpareLines}
          onOpenLaneNotes={onOpenLaneNotes}
          onOpenAlleyReport={onOpenAlleyReport}
        />
      </div>

      <div className="mt-2">
        {protection?.kind === "backup" && (
          <div
            className={`mt-3 flex gap-3 rounded-[22px] border px-4 py-3 ${
              protection.urgency === "overdue"
                ? "border-danger-200 bg-danger-50 text-danger-700"
                : "border-warning-200 bg-warning-50 text-warning-700"
            }`}
          >
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {plural(nudgeSessionsSince, {
                  one: `# session not backed up. Last backup: ${lastBackup}.`,
                  other: `# sessions not backed up. Last backup: ${lastBackup}.`
                })}
              </p>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={onOpenBackup}
                  className={`relative text-xs font-bold underline active:no-underline ${TAP_TARGET_44}`}
                >
                  {t`Save a copy`}
                </button>
                {/* An installed app that is overdue has no Later. A reminder that
                    can be put off for ever never reaches the person who most
                    needs it (ADR-067). */}
                {protection.canLater && (
                  <button
                    type="button"
                    onClick={handleBackupLater}
                    className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold opacity-80 ${TAP_TARGET_44}`}
                  >
                    {t`Later`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* The setup and safety cards sit under the profile, not between it
            and the greeting: Home opens on the bowler. */}
        {setupCard === "step" && (
          <NextSteps
            max={1}
            skip={HOME_SKIPPED_STEPS}
            onOpenArsenal={onOpenArsenal}
            onOpenSpareLines={onOpenSpareLines}
            onOpenOilPatterns={onOpenOilPatterns}
            onOpenLaneNotes={onOpenLaneNotes}
          />
        )}
        {setupCard === "feedback" && <FeedbackPrompt />}
      </div>

      <ProHomeBanner />

      <div className="mt-6">
        <ToolCards
          heading={t`Tools and reference`}
          onOpenLayoutLab={onOpenLayoutLab}
          onOpenLineVisualizer={onOpenLineVisualizer}
          onOpenOilPatterns={onOpenOilPatterns}
          onOpenCatalog={onOpenCatalog}
          onOpenGuides={onOpenGuides}
        />
      </div>

      <SessionFormDialog
        open={showForm}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
      />

      {editingName && <BowlerNameSheet name={name} onClose={() => setEditingName(false)} />}
    </section>
  );
}
