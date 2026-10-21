import { ChevronRight, PlayCircle, Plus, ShieldCheck } from "lucide-react";
import { PinIcon } from "../components/icons";
import { ToolsList } from "../components/ToolsList";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { alleyLabel } from "../lib/sessionLabels";
import { setRemembered } from "../lib/viewMemory";
import { Fab, FabRow } from "../components/ui/Fab";
import { ArsenalGrid, ProfileTiles, RecentSessionStrip } from "../components/HomeProfile";
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
  /** Start scoring with nothing filled in (ADR-080). */
  onScoreNow: () => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string;
  resumable?: ResumableGame | null;
  onResume?: () => void;
  onOpenSession: (sessionId: number, openStats?: boolean) => void;
  onViewAll: () => void;
  activeSessionId?: number | null;
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
}

/** Recent sessions on Home, as one sideways row of tiles. History is one tap
 *  away and holds the rest, with the games and the lanes; a few weeks of tiles
 *  is enough to find last week's session without Home becoming a second
 *  History. */
const RECENT_LIMIT = 8;

/** Next steps Home asks for elsewhere. The arsenal grid's empty slot, beside
 *  the greeting, already asks for the balls, and a step asking again was the
 *  same card twice. */
const HOME_SKIPPED_STEPS: readonly NextStepKey[] = ["arsenal"];

// A stable empty list: `?? []` would be a new array on every render.
const NO_SESSIONS: SessionSummary[] = [];

export function DashboardView({
  onStartSession,
  onScoreNow,
  isSubmitting = false,
  error,
  resumable,
  onResume,
  onOpenSession,
  onViewAll,
  activeSessionId,
  onOpenCatalog,
  onOpenLineVisualizer,
  onOpenLayoutLab,
  onOpenAlleyReport,
  onOpenArsenal,
  onOpenLaneNotes,
  onOpenOilPatterns,
  onOpenSpareLines,
  onOpenGuides,
  onOpenBackup
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
  const recent = sessions.slice(0, RECENT_LIMIT);
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
  const backupAge = nudge ? describeAge(nudge.lastBackupAt, nudge.now) : "never";

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
    // The foot clears the floating Start session button (56px, 8px above the
    // tab bar) and no more: `<main>` already pads by the tab bar, and the 96px
    // this used to add let a Home that fits the screen scroll up a step.
    <section className="mx-auto w-full max-w-xl px-3 pb-[4.25rem] pt-3 sm:px-6 sm:pt-5">
      <GetTheAppBanner />
      {/* The greeting is the screen's title. It offers a name only while there
          is none: a name is set once, and changing it lives in Settings. */}
      {/* The top band is the bowler: the app's mark and the greeting on the
          left, their arsenal on the right. The arsenal takes the wider share
          because it carries pictures; the left column has room to grow. */}
      <div className="mb-4 flex items-start gap-4">
        <div className="flex w-[38%] min-w-0 shrink-0 flex-col items-start">
          {/* The app's mark, and once this copy has Pro, the Pro mark in its
              place (ADR-167). */}
          {owned ? (
            <ProMark size={44} title="Headpin Pro" className="mb-2 rounded-xl shadow-sm" />
          ) : (
            <img
              src="/icons/icon-192.png"
              alt=""
              width={44}
              height={44}
              className="mb-2 h-11 w-11 rounded-xl shadow-sm"
            />
          )}
          <h1 className="text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">
            {named ? greeting(name, greetingIndex) : "\u00a0"}
          </h1>
          {named && !name && (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className={`relative mt-1 text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
            >
              Add your name
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <ArsenalGrid balls={balls} onOpenArsenal={onOpenArsenal} />
        </div>
      </div>

      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {/* A game in progress leads the screen, so carrying on is one tap. A new
          session starts from the floating button, and a device that has never
          scored a game is told what the app is first (DESIGN-LANGUAGE §5). */}
      {/* One way in for a bowler who has never scored, and it goes straight to
          the pin deck: every detail the form would ask for can be added from
          the session afterwards (ADR-080). Three buttons that all started a
          session, two of them only differing in whether a form came first,
          was a choice put to somebody with nothing to choose on (ADR-150). */}
      {coldStart ? (
        <EmptyState
          icon={PinIcon}
          title="Score your first session"
          description="Tap in each shot as you bowl. Add the alley and lanes whenever you like."
        >
          <Button variant="primary" disabled={isSubmitting} onClick={() => void onScoreNow()}>
            Start scoring
          </Button>
        </EmptyState>
      ) : resumable ? (
        <button
          type="button"
          onClick={onResume}
          className="flex w-full items-center gap-3 rounded-xl border border-accent-fill bg-accent-fill p-4 text-left text-accent-on-fill shadow-sm active:bg-accent-fill-hover"
        >
          <PlayCircle size={28} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">Resume game</span>
            <span className="block truncate text-sm">
              {alleyLabel(resumable.alleyName)} · Game {resumable.gameNumber}
            </span>
          </span>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
        </button>
      ) : null}

      {/* The rest of the bowler's own things, under the greeting and the
          arsenal: spare lines, lane notes and the Alley report as equal tiles,
          and the latest sessions. The tools and reading that are the same for
          everyone, the oil patterns among them, follow as a list, because they
          are a different kind of place (ADR-146). */}
      <div className="mt-3 space-y-3">
        <ProfileTiles
          spareLines={facts?.answeredSpareLines}
          laneNotes={facts?.laneNoteCount}
          alleys={alleyCount}
          onOpenSpareLines={onOpenSpareLines}
          onOpenLaneNotes={onOpenLaneNotes}
          onOpenAlleyReport={onOpenAlleyReport}
        />
        {!coldStart && !loadingRecent && (
          <RecentSessionStrip
            sessions={recent}
            activeSessionId={activeSessionId}
            onOpenSession={onOpenSession}
            hasMore={sessions.length > RECENT_LIMIT}
            onViewAll={onViewAll}
          />
        )}
      </div>

      <div className="mt-2">
        {protection?.kind === "backup" && (
          <div
            className={`mt-3 flex gap-3 rounded-xl border p-3 ${
              protection.urgency === "overdue"
                ? "border-danger-200 bg-danger-50 text-danger-700"
                : "border-warning-200 bg-warning-50 text-warning-700"
            }`}
          >
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {nudgeSessionsSince} {nudgeSessionsSince === 1 ? "session" : "sessions"} not backed
                up. Last backup: {backupAge}.
              </p>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={onOpenBackup}
                  className={`relative text-xs font-bold underline active:no-underline ${TAP_TARGET_44}`}
                >
                  Save a copy
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
                    Later
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
        <ToolsList
          heading="Tools and reference"
          onOpenLayoutLab={onOpenLayoutLab}
          onOpenLineVisualizer={onOpenLineVisualizer}
          onOpenOilPatterns={onOpenOilPatterns}
          onOpenCatalog={onOpenCatalog}
          onOpenGuides={onOpenGuides}
        />
      </div>

      {/* Not on a cold start, where the empty state's button is the way in,
          and not before the sessions are read, or it would flash in first. */}
      {!coldStart && !loadingRecent && (
        <FabRow>
          <Fab icon={Plus} label="Start session" extended onClick={() => setShowForm(true)} />
        </FabRow>
      )}

      <SessionFormDialog
        open={showForm}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
        onOpenAlleyReport={(alley) => {
          setRemembered("plan:alley", alley);
          setShowForm(false);
          onOpenAlleyReport();
        }}
      />

      {editingName && <BowlerNameSheet name={name} onClose={() => setEditingName(false)} />}
    </section>
  );
}
