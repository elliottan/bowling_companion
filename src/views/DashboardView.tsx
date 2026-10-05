import { BookOpen, ChevronRight, Compass, GraduationCap, PlayCircle, Plus, ShieldCheck } from "lucide-react";
import { LaneViewIcon, PinIcon } from "../components/icons";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { alleyLabel } from "../lib/sessionLabels";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { Fab, FabRow } from "../components/ui/Fab";
import { ArsenalGrid, ProfileTiles, RecentSessionStrip } from "../components/HomeProfile";
import { BowlerNameSheet } from "../components/BowlerNameSheet";
import { GREETINGS, greeting } from "../lib/greeting";
import { InstallPrompt } from "../components/InstallPrompt";
import { NextSteps } from "../components/NextSteps";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { NewSessionFormValues } from "../components/SessionForm";
import { getBalls } from "../services/ballRepository";
import {
  getBackupNudgeState,
  getBowlerName,
  getSessionList,
  getSetting,
  setBackupNudgeSnoozedUntil,
  setSetting,
  type ResumableGame
} from "../services/bowlingRepository";
import { describeAge, protectionCard, snoozeMs } from "../lib/backupNudge";
import { canPromptInstall, isIOSSafari, isStandalone } from "../lib/installPrompt";
import { nextSteps } from "../lib/onboarding";
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
  onOpenArsenal: () => void;
  onOpenLaneNotes: () => void;
  onOpenOilPatterns: () => void;
  onOpenSpareLines: () => void;
  onOpenGuides: () => void;
  onOpenBackup: () => void;
}

const INSTALL_NUDGE_DISMISSED_KEY = "install_nudge_dismissed_at";

/** The install nudge snoozes rather than dismissing for ever. Someone who says
 *  not now on a borrowed phone still wants the offer on their own, and 30 days
 *  is long enough that it is never nagging. The Settings row is the way back
 *  before then. */
const INSTALL_SNOOZE_DAYS = 30;

/** Recent sessions on Home, as one sideways row of tiles. History is one tap
 *  away and holds the rest, with the games and the lanes; a few weeks of tiles
 *  is enough to find last week's session without Home becoming a second
 *  History. */
const RECENT_LIMIT = 8;

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
  onOpenArsenal,
  onOpenLaneNotes,
  onOpenOilPatterns,
  onOpenSpareLines,
  onOpenGuides,
  onOpenBackup
}: DashboardViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // Picked once per visit to Home, so the greeting changes between visits but
  // holds still while the screen is up.
  const [greetingIndex] = useState(() => Math.floor(Math.random() * GREETINGS.length));
  // Wrapped, because an unset name is null and the query not having answered
  // yet is undefined, and the greeting should not flash between the two.
  const named = useLiveQuery(async () => ({ name: await getBowlerName() }));
  const name = named?.name ?? null;
  const balls = useLiveQuery(() => getBalls());
  const [installPromptOpen, setInstallPromptOpen] = useState(false);

  // Live: finishing a game, deleting a session or importing a backup all show
  // up here without the dashboard being told to reload. The list loader skips
  // scored games' frames (ADR-066), and the recent alleys need every session,
  // so it is read whole and cut here.
  const liveSessions = useLiveQuery(() => getSessionList());
  const sessions = liveSessions ?? NO_SESSIONS;
  const recent = sessions.slice(0, RECENT_LIMIT);
  const loadingRecent = liveSessions === undefined;
  const coldStart = !loadingRecent && sessions.length === 0;

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

  // Wrapped in an object because the setting is itself undefined when unset,
  // which would otherwise be indistinguishable from "the query has not
  // answered yet" and flash the card on every load.
  // The clock is read inside the query, not in render: `Date.now()` in a
  // render body is a value that changes without a re-render to explain it.
  const installNudge = useLiveQuery(async () => {
    const dismissedAt = await getSetting(INSTALL_NUDGE_DISMISSED_KEY);
    const snoozedUntil = dismissedAt
      ? new Date(dismissedAt).getTime() + INSTALL_SNOOZE_DAYS * 24 * 60 * 60 * 1000
      : 0;
    return { snoozed: snoozedUntil > Date.now() };
  });
  const installEligible = (isIOSSafari() && !installed) || canPromptInstall();
  const installOffered = installEligible && !!installNudge && !installNudge.snoozed;
  // One card, never two (ADR-115).
  const protection = nudge && installNudge ? protectionCard(nudge, installed, installOffered) : null;

  function handleBackupLater() {
    void setBackupNudgeSnoozedUntil(new Date(Date.now() + snoozeMs(installed)).toISOString());
  }

  // The card dismisses by writing the setting it reads: the live query above
  // picks the write up, so there is no second copy of "is it showing".
  function dismissInstall() {
    void setSetting(INSTALL_NUDGE_DISMISSED_KEY, new Date().toISOString());
  }

  async function handleSubmit(values: NewSessionFormValues) {
    await onStartSession(values);
    setShowForm(false);
  }


  // At most one of the setup cards at a time: a step if there is one owed,
  // else the one-time feedback ask.
  const stepOwed = !!facts && nextSteps(facts).length > 0;

  return (
    <section className="mx-auto w-full max-w-xl px-3 pb-24 pt-3 sm:px-6 sm:pt-5">
      {/* The greeting is the screen's title, and the way to say what you want
          to be called: Settings holds the same sheet. */}
      {/* The top band is the bowler: the app's mark and the greeting on the
          left, their arsenal on the right. The arsenal takes the wider share
          because it carries pictures; the left column has room to grow. */}
      <div className="mb-4 flex items-start gap-4">
        <div className="flex w-[38%] min-w-0 shrink-0 flex-col items-start">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="mb-2 h-11 w-11 rounded-xl shadow-sm"
          />
          <h1 className="text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">
            {named ? (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title={name ? "Change your name" : undefined}
                className="text-left active:opacity-60"
              >
                {greeting(name, greetingIndex)}
              </button>
            ) : (
              "\u00a0"
            )}
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
      {coldStart ? (
        <EmptyState
          icon={PinIcon}
          title="Score your first session"
          description="Start a session and tap in each shot."
        >
          <Button variant="primary" onClick={() => setShowForm(true)}>
            Start session
          </Button>
          {/* The fastest route to the pin deck, for a bowler seeing the app for
              the first time. Details are added afterwards (ADR-080). */}
          <Button variant="ghost" disabled={isSubmitting} onClick={() => void onScoreNow()}>
            Score now, add details later
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
          arsenal: the three other things a bowler keeps as equal tiles, and
          the latest sessions. The tools and reading that are the
          same for everyone follow as a list, because they are a different kind
          of place. */}
      <div className="mt-3 space-y-3">
        <ProfileTiles
          spareLines={facts?.answeredSpareLines}
          laneNotes={facts?.laneNoteCount}
          oilPatterns={facts?.oilPatternCount}
          onOpenSpareLines={onOpenSpareLines}
          onOpenLaneNotes={onOpenLaneNotes}
          onOpenOilPatterns={onOpenOilPatterns}
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
        {protection?.kind === "install" && (
          <div className="mt-3 flex gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-warning-700">
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Keep your scores safe</p>
              <p className="mt-0.5 text-xs">
                A browser can clear what this site stores after a week away. On your home screen,
                Headpin keeps it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4">
                <button
                  type="button"
                  onClick={() => setInstallPromptOpen(true)}
                  className={`relative text-xs font-bold underline active:no-underline ${TAP_TARGET_44}`}
                >
                  Add to Home Screen
                </button>
                {protection.backupOwed && (
                  <button
                    type="button"
                    onClick={onOpenBackup}
                    className={`relative text-xs font-semibold underline active:no-underline ${TAP_TARGET_44}`}
                  >
                    Save a copy
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissInstall}
                  aria-label="Not now: add to Home Screen"
                  className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold opacity-80 ${TAP_TARGET_44}`}
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}

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
        {stepOwed ? (
          <NextSteps
            max={1}
            onOpenArsenal={onOpenArsenal}
            onOpenSpareLines={onOpenSpareLines}
            onOpenOilPatterns={onOpenOilPatterns}
            onOpenLaneNotes={onOpenLaneNotes}
          />
        ) : (
          <FeedbackPrompt />
        )}
      </div>

      <div className="mt-6">
        <ListGroup heading="Tools and reference">
          <ListRow
            icon={Compass}
            label="Layout lab"
            ariaLabel="Layout lab"
            description="Try a layout on your PAP"
            onClick={onOpenLayoutLab}
          />
          <ListRow
            icon={LaneViewIcon}
            label="Line visualizer"
            ariaLabel="Line visualizer"
            description="Sketch a line on the lane"
            onClick={onOpenLineVisualizer}
          />
          <ListRow
            icon={BookOpen}
            label="Ball catalog"
            ariaLabel="Ball catalog"
            description="Manufacturer specs"
            onClick={onOpenCatalog}
          />
          <ListRow
            icon={GraduationCap}
            label="Guides"
            ariaLabel="Guides"
            description="Layouts, drilling and equipment"
            onClick={onOpenGuides}
          />
        </ListGroup>
      </div>

      <FabRow>
        <Fab icon={Plus} label="Start session" onClick={() => setShowForm(true)} />
      </FabRow>

      <SessionFormDialog
        open={showForm}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        isSubmitting={isSubmitting}
      />

      <InstallPrompt open={installPromptOpen} onClose={() => setInstallPromptOpen(false)} />

      {editingName && <BowlerNameSheet name={name} onClose={() => setEditingName(false)} />}
    </section>
  );
}
