import { ChevronLeft, Plus, Share2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import { SaveCopyPrompt } from "../components/SaveCopyPrompt";
import { ShareCardDialog } from "../components/ShareCardDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionHeaderText } from "../components/SessionHeaderText";
import { SessionLanePanel, type SessionPanelTab } from "../components/SessionLanePanel";
import { Button } from "../components/ui/Button";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
import { IconButton } from "../components/ui/IconButton";
import { FormSheet } from "../components/ui/FormSheet";
import { AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import { FIELD } from "../components/ui/field";
import type { NewSessionFormValues } from "../components/SessionForm";
import { useLiveQuery } from "dexie-react-hooks";
import { backupUrgency as urgencyOf, snoozeMs } from "../lib/backupNudge";
import { isStandalone } from "../lib/installPrompt";
import { calculateGameScore } from "../lib/scoring";
import { calculateStats } from "../lib/stats";
import { buildSessionCard } from "../lib/shareCard";
import { useHandedness } from "../lib/handednessContext";
import { useLongPress } from "../lib/useLongPress";
import {
  addNextGameToSession,
  deleteGame,
  getBackupNudgeState,
  getSessionDetails,
  saveFrame,
  setBackupNudgeSnoozedUntil,
  updateGameLanes,
  updateSession
} from "../services/bowlingRepository";
import type { Frame, Game, SessionSummary } from "../types/bowling";
import { GROUP_HEADING } from "../components/ui/typography";

interface ActiveSessionViewProps {
  sessionId: number;
  /** Open the session panel on the Stats tab as soon as the view mounts. */
  openStatsOnMount?: boolean;
  /** Fired once the stats sheet has been auto-opened, so the flag can reset. */
  onStatsOpened?: () => void;
  /** Land on this game rather than the latest one (a stats drill-down). */
  initialGameId?: number;
  /** The ball that drill-down was about: the session sheet opens on the game
   *  with the shots it threw lit up. */
  initialBallId?: number;
  /** Fired once that game has been selected, so the flag can reset. */
  onGameOpened?: () => void;
  onBack: () => void;
  /** Called when the last game is deleted and the session no longer exists. */
  onSessionDeleted: () => void;
  /** Jump to Arsenal to manage balls. */
  onOpenArsenal: () => void;
}

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

// Games whose lane prompt has already auto-opened this app run. Module-level
// so the once-per-game rule survives tab switches (which remount this view).
const lanePromptedGameIds = new Set<number>();

// Games whose share offer has been dismissed. Module-level for the same reason
// as the set above: a tab switch remounts this view and must not re-ask.
const sharePromptDismissed = new Set<number>();

export function ActiveSessionView({
  sessionId,
  openStatsOnMount = false,
  onStatsOpened,
  initialGameId,
  initialBallId,
  onGameOpened,
  onBack,
  onSessionDeleted,
  onOpenArsenal
}: ActiveSessionViewProps) {
  const [sessionDetails, setSessionDetails] = useState<SessionSummary | null>(null);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<number | null>(null);
  const [chipMenu, setChipMenu] = useState<{ gameId: number; left: number; top: number } | null>(null);
  // A game drill-down lands on the session sheet, scrolled to that game: the
  // question it was asked from ("what did this ball do in game 3") is answered
  // by the frames, not by the scorer parked on one of them.
  const [showSheet, setShowSheet] = useState(openStatsOnMount || initialGameId != null);
  // Captured at mount: the drill-down flags are one-shot, and the reset lands
  // in the same commit as the loaded session, so reading the prop later would
  // find it already cleared and the sheet would open with nothing lit.
  const [landingBallId] = useState(initialBallId);
  const [sheetTab, setSheetTab] = useState<SessionPanelTab>(openStatsOnMount ? "stats" : "sheet");
  const [showEdit, setShowEdit] = useState(false);
  // Frame handed to the scorer when one is tapped in the session sheet.
  const [focusFrame, setFocusFrame] = useState<{ frameNumber: number; shotIndex: number; token: number } | undefined>();

  // Inline lane editor
  const [laneA, setLaneA] = useState("");
  const [laneB, setLaneB] = useState("");
  const [startSide, setStartSide] = useState<"A" | "B">("A");
  const [laneError, setLaneError] = useState("");
  const [showLaneEditor, setShowLaneEditor] = useState(false);

  // The backup ask, in session (ADR-068). Only in a browser tab: installed,
  // storage is durable and the dashboard nudge is soon enough.
  const installed = isStandalone();
  const nudge = useLiveQuery(() => getBackupNudgeState());
  const saveCopyUrgency = !installed && nudge ? urgencyOf(nudge, installed) : "none";

  const handedness = useHandedness();
  const [shareOpen, setShareOpen] = useState(false);
  // Bumped on dismiss so the prompt below re-evaluates; the set itself is
  // module-level and does not trigger a render on its own.
  const [shareDismissTick, setShareDismissTick] = useState(0);

  function handleSaveCopyLater() {
    void setBackupNudgeSnoozedUntil(new Date(Date.now() + snoozeMs(installed)).toISOString());
  }

  /** Closes an overdue nudge without recording anything, so it is back on the
   *  next launch. ADR-067 refuses to let it be silenced for good; ADR-073 still
   *  lets it be got out of the way. */
  const [saveCopyHidden, setSaveCopyHidden] = useState(false);

  useEffect(() => {
    if (openStatsOnMount) onStatsOpened?.();
    // Mount-only: the flag is consumed by the initial state above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const longPress = useLongPress();

  const activeGame = useMemo(
    () => sessionDetails?.games.find((g) => g.id === activeGameId) ?? null,
    [activeGameId, sessionDetails]
  );

  useEffect(() => {
    const lanes = activeGame?.lanes ?? (activeGame?.lane_number ? [activeGame.lane_number] : []);
    setLaneA(lanes[0] ?? "");
    setLaneB(lanes[1] ?? "");
    setStartSide(activeGame?.start_lane && activeGame.start_lane === lanes[1] ? "B" : "A");
    setLaneError("");
  }, [activeGame?.id, activeGame?.lanes, activeGame?.lane_number, activeGame?.start_lane]);

  // Auto-open the lane editor at most once per game, and only while the game
  // has no recorded shots yet. Tab switches remount this view — without the
  // guards the dialog re-opened on every return while lanes stayed unset.
  // The inline "Set lanes" row remains the manual entry point after dismissal.
  useEffect(() => {
    if (!activeGame?.id || lanePromptedGameIds.has(activeGame.id)) return;
    const lanes = activeGame.lanes ?? (activeGame.lane_number ? [activeGame.lane_number] : []);
    const lanesUnset = lanes.filter((l) => l && l.trim()).length === 0;
    const frames = (activeGame as Game & { frames: Frame[] }).frames ?? [];
    const hasShots = frames.some((f) => f.shots.length > 0);
    if (lanesUnset && !hasShots) {
      lanePromptedGameIds.add(activeGame.id);
      setShowLaneEditor(true);
    }
    // Keyed on the game id alone: this fires once per game, and re-running it
    // whenever any other field of `activeGame` changes would re-open the editor
    // mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGame?.id]);

  // `side` defaults to current state but the start-lane toggle passes it
  // explicitly to avoid saving a stale value before the state update lands.
  async function saveLanes(side: "A" | "B" = startSide) {
    if (!activeGame?.id) return;
    const a = laneA.trim();
    const b = laneB.trim();
    if ((a && !isPositiveInt(a)) || (b && !isPositiveInt(b)) || (!a && b)) {
      setLaneError("Enter whole numbers for both lanes.");
      return;
    }
    setLaneError("");
    let lanes = [a, b].filter(Boolean);
    // The starting lane is tracked by value so it survives the lower-on-left
    // reorder below.
    const startValue = lanes.length === 2 ? (side === "A" ? a : b) : lanes[0];
    // Lower-numbered lane goes on the left. This runs on blur (not while typing),
    // so digits aren't shuffled mid-entry.
    if (lanes.length === 2 && Number(lanes[1]) < Number(lanes[0])) {
      lanes = [lanes[1], lanes[0]];
      setLaneA(lanes[0]);
      setLaneB(lanes[1]);
      setStartSide(startValue === lanes[0] ? "A" : "B");
    }
    const start_lane = lanes.length === 2 ? startValue : lanes[0];
    await updateGameLanes(activeGame.id, { lanes, start_lane });
    await refreshSession(activeGame.id);
  }

  async function refreshSession(nextActiveGameId?: number) {
    const details = await getSessionDetails(sessionId);
    if (!details) throw new Error("Session not found.");
    setSessionDetails(details);
    const selected =
      details.games.find((g) => g.id === nextActiveGameId) ??
      details.games[details.games.length - 1] ??
      null;
    setActiveGameId(selected?.id ?? null);
  }

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const details = await getSessionDetails(sessionId);
        if (!isMounted) return;
        if (!details) throw new Error("Session not found.");
        setSessionDetails(details);
        // A drill-down names the game; otherwise carry on from the latest.
        const requested = initialGameId
          ? details.games.find((g) => g.id === initialGameId)
          : undefined;
        const landing = requested ?? details.games[details.games.length - 1] ?? null;
        setActiveGameId(landing?.id ?? null);
        if (requested) onGameOpened?.();
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load session.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
    // initialGameId is read on load only: it is a one-shot landing instruction,
    // and re-running on its reset would yank the game back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleFrameComplete(frame: Frame) {
    if (!activeGame?.id) throw new Error("No active game selected.");
    await saveFrame(activeGame.id, frame);
    await refreshSession(activeGame.id);
  }

  async function handleAddGame() {
    if (isAddingGame) return;
    setError("");
    setIsAddingGame(true);
    try {
      const nextGameId = await addNextGameToSession(sessionId);
      await refreshSession(nextGameId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add game.");
    } finally {
      setIsAddingGame(false);
    }
  }

  async function handleDeleteGame() {
    const gameId = confirmDeleteGame;
    setConfirmDeleteGame(null);
    if (gameId == null) return;
    try {
      const result = await deleteGame(gameId);
      if (result.sessionDeleted) {
        onSessionDeleted();
        return;
      }
      await refreshSession(activeGameId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete game.");
    }
  }

  async function handleSaveEdit(values: NewSessionFormValues) {
    try {
      await updateSession(sessionId, values);
      setShowEdit(false);
      await refreshSession(activeGameId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update session.");
    }
  }

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-ink-secondary">
        Loading…
      </section>
    );
  }

  if (!sessionDetails || !activeGame) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <ErrorBanner>{error || "Couldn't find an active game for this session."}</ErrorBanner>
        <Button variant="secondary" onClick={onBack} className="mt-3">
          <ChevronLeft size={16} aria-hidden="true" />
          Back
        </Button>
      </section>
    );
  }

  const games = sessionDetails.games;
  // The chips + button can add a game at any time.
  const canAddGame = !isAddingGame;
  // Series total = sum of every game's score (final, or running if unfinished).
  const seriesTotal = games.reduce(
    (sum, g) => sum + (g.final_score ?? calculateGameScore((g as Game & { frames: Frame[] }).frames).total),
    0
  );
  // Average over completed games only — an in-progress game would drag it down.
  const finalScores = games.flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
  const seriesAvg = finalScores.length
    ? Math.round(finalScores.reduce((a, b) => a + b, 0) / finalScores.length)
    : null;

  // The card the share sheet draws. Built from the same numbers the header
  // shows, so the picture and the screen can never disagree.
  const sessionStats = calculateStats([sessionDetails], undefined, handedness);
  const shareCard = buildSessionCard({
    alleyName: sessionDetails.session.alley_name,
    event: sessionDetails.session.description,
    date: sessionDetails.session.date,
    scores: games.map(
      (g) => g.final_score ?? calculateGameScore((g as Game & { frames: Frame[] }).frames).total
    ),
    finalScores,
    strikePct: sessionStats.strikePct,
    sparePct: sessionStats.sparePct
  });

  // The offer to share, once a game is finished, and never on top of the
  // backup prompt: one asks for something the user needs and the other for
  // something optional, so they must not compete for the same strip of screen.
  const finishedGameId = activeGame.final_score !== undefined ? activeGame.id : null;
  const offerShare =
    finishedGameId != null &&
    saveCopyUrgency === "none" &&
    !sharePromptDismissed.has(finishedGameId) &&
    // Referenced so dismissing re-renders; the set itself is not reactive.
    shareDismissTick >= 0;

  function dismissSharePrompt() {
    if (finishedGameId != null) sharePromptDismissed.add(finishedGameId);
    setShareDismissTick((t) => t + 1);
  }

  // Confirm copy names the game being deleted (the pressed chip's game, which
  // may not be the active one) and its score when it has one.
  const gameToDelete = games.find((g) => g.id === confirmDeleteGame);
  const deleteGameScore =
    gameToDelete &&
    (gameToDelete.final_score ??
      (((gameToDelete as Game & { frames: Frame[] }).frames.length > 0
        ? calculateGameScore((gameToDelete as Game & { frames: Frame[] }).frames).total
        : undefined)));
  const deleteGameMessage = gameToDelete
    ? `Game ${gameToDelete.game_number}${deleteGameScore ? ` (score ${deleteGameScore})` : ""} and its frames will be permanently deleted.`
    : "";

  return (
    <div>
      <section className="mx-auto w-full max-w-5xl px-3 pt-2 sm:px-6">
        <div className="flex items-start gap-2">
          {/* Tapping the identity block opens the sheet; the oil-pattern link
              inside it stops propagation so it still opens the pattern PDF. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setSheetTab("sheet"); setShowSheet(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSheetTab("sheet");
                setShowSheet(true);
              }
            }}
            className="min-w-0 flex-1 rounded-md hover:bg-surface-muted active:bg-surface-muted"
            aria-label="Open session sheet and lane notes"
          >
            <SessionHeaderText session={sessionDetails.session} games={games} />
          </div>
          <IconButton
            label="Share this night"
            variant="round"
            className="shrink-0"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={18} aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            onClick={() => { setSheetTab("stats"); setShowSheet(true); }}
            aria-label="Open session stats"
            className="shrink-0 rounded-md text-right hover:bg-surface-muted active:bg-surface-muted"
          >
            <span className="block text-2xl font-extrabold leading-none text-accent">
              {seriesTotal}
            </span>
            {seriesAvg !== null && (
              <span className="block text-xs font-semibold text-ink-secondary">{seriesAvg} avg</span>
            )}
          </button>
        </div>

        {/* py-1, not pb-1: overflow-x-auto forces overflow-y to auto, which
            clips at the padding box. The Chip tap region overhangs its box 4px
            top and bottom, so both sides need padding or the top 4px is dead. */}
        <div className="mt-2 flex items-center gap-2 overflow-x-auto py-1">
          {games.map((g) => {
            const frames = (g as Game & { frames: Frame[] }).frames;
            return (
              <Chip
                key={g.id}
                selected={g.id === activeGameId}
                {...longPress.bind((chip) => {
                  if (!g.id) return;
                  const rect = chip.getBoundingClientRect();
                  setChipMenu({
                    gameId: g.id,
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 184)),
                    top: rect.bottom + 4
                  });
                })}
                onClick={() => {
                  if (longPress.didLongPress()) return;
                  if (g.id) setActiveGameId(g.id);
                }}
                className="shrink-0 gap-1.5"
              >
                G{g.game_number}
                {g.final_score !== undefined ? (
                  <span className="opacity-80">· {g.final_score}</span>
                ) : (
                  frames.length > 0 && (
                    <span className="opacity-80">· {calculateGameScore(frames).total}+</span>
                  )
                )}
              </Chip>
            );
          })}
          {/* Chip-height (h-9), not the 44pt IconButton: it sits in the chip
              row and a taller box makes the row look ragged. Tap target is
              expanded vertically the same way Chip does it. It also wears
              Chip's own unselected skin, because a `bg-ink` slab was the only
              near-black object in light mode and out-shouted the selected
              game chip beside it. */}
          <button
            type="button"
            onClick={() => void handleAddGame()}
            disabled={!canAddGame}
            aria-label="New game"
            title="New game"
            className={`relative inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md border border-edge-strong bg-surface text-accent hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${TAP_TARGET_44}`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>

        {chipMenu && (
          <AnchoredMenu left={chipMenu.left} top={chipMenu.top} onClose={() => setChipMenu(null)}>
            <AnchoredMenuItem
              icon={Trash2}
              danger
              onClick={() => {
                const gameId = chipMenu.gameId;
                setChipMenu(null);
                setConfirmDeleteGame(gameId);
              }}
            >
              Delete game
            </AnchoredMenuItem>
          </AnchoredMenu>
        )}

        {error && (
          <ErrorBanner className="mt-3">{error}</ErrorBanner>
        )}

        {/* Gated on a finished game in THIS session, not on the session count
            alone. A night that has just been created is already one session
            "behind", and asking someone to back up before they have thrown a
            ball is how a prompt teaches itself to be ignored (ADR-068). */}
        {saveCopyUrgency !== "none" && finalScores.length > 0 && !saveCopyHidden && (
          <SaveCopyPrompt
            urgency={saveCopyUrgency}
            onLater={handleSaveCopyLater}
            onDismiss={() => setSaveCopyHidden(true)}
          />
        )}

        {/* Not a warning: accent, not amber. Nothing is at risk here, the app
            is only offering. */}
        {offerShare && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent-soft bg-accent-soft p-3">
            <p className="flex-1 text-sm font-semibold text-accent">
              Game {activeGame.game_number} is in the books. Share the night?
            </p>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={`relative shrink-0 text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
            >
              Share
            </button>
            {/* Named, not just "Dismiss": the line-capture prompt below it also has a
                dismiss, and two identical labels on one screen leave a screen
                reader user with no way to tell them apart. */}
            <IconButton label="Dismiss share offer" onClick={dismissSharePrompt} className="shrink-0">
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </section>

      <ActiveGameScorer
        gameKey={activeGame.id}
        initialFrames={(activeGame as Game & { frames: Frame[] }).frames}
        sessionFrames={games
          .filter((g) => g.id !== activeGame.id)
          .flatMap((g) => (g as Game & { frames: Frame[] }).frames)}
        previousGames={games
          .filter((g) => g.game_number < activeGame.game_number)
          .map((g) => ({
            game: g,
            frames: (g as Game & { frames: Frame[] }).frames
          }))}
        mode="session"
        game={activeGame}
        focusFrame={focusFrame}
        onFrameComplete={handleFrameComplete}
        onEditLanes={() => setShowLaneEditor(true)}
        onOpenArsenal={onOpenArsenal}
      />

      <ConfirmDialog
        open={confirmDeleteGame != null}
        title="Delete this game?"
        message={deleteGameMessage}
        onConfirm={handleDeleteGame}
        onCancel={() => setConfirmDeleteGame(null)}
      />

      <ShareCardDialog
        open={shareOpen}
        card={shareCard}
        onClose={() => setShareOpen(false)}
      />

      {showSheet && (
        <SessionLanePanel
          summary={sessionDetails}
          currentGameId={activeGame.id}
          defaultTab={sheetTab}
          highlightBallId={landingBallId}
          // Close the sheet first: it portals to body after the edit dialog,
          // so it would otherwise paint on top of it.
          onEdit={() => { setShowSheet(false); setShowEdit(true); }}
          onSelectFrame={(gameId, frameNumber, shotIndex) => {
            setActiveGameId(gameId);
            setFocusFrame((prev) => ({ frameNumber, shotIndex, token: (prev?.token ?? 0) + 1 }));
            setShowSheet(false);
          }}
          onClose={() => setShowSheet(false)}
        />
      )}

      <SessionFormDialog
        open={showEdit}
        title="Edit session"
        submitLabel="Save"
        initial={{
          alley_name: sessionDetails.session.alley_name,
          date: sessionDetails.session.date,
          description: sessionDetails.session.description,
          oil_pattern_id: sessionDetails.session.oil_pattern_id,
          general_notes: sessionDetails.session.general_notes
        }}
        onSubmit={handleSaveEdit}
        onCancel={() => setShowEdit(false)}
      />

      {/* Lanes save as you type, so the sheet carries a close and no commit. */}
      {showLaneEditor && (
        <FormSheet
          title={`Game ${activeGame?.game_number ?? 1} lanes`}
          onClose={() => setShowLaneEditor(false)}
        >
            <p className="text-xs text-ink-secondary">
              Sets the pair for this game only.
            </p>

            <span className={`mt-4 block ${GROUP_HEADING}`}>Lane pair</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={laneA}
                onChange={(e) => setLaneA(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="First lane"
                placeholder="12"
                className={`${FIELD} h-11 w-16 text-center`}
              />
              <span aria-hidden="true" className="text-ink-secondary">/</span>
              <input
                value={laneB}
                onChange={(e) => setLaneB(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="Second lane"
                placeholder="13"
                className={`${FIELD} h-11 w-16 text-center`}
              />
            </div>

            {laneA.trim() && laneB.trim() && (
              <div className="mt-4">
                {/* Named for the game being changed: the same dialog is opened
                    from every game, and the fix is usually to one of them. */}
                <span className={`block ${GROUP_HEADING}`}>
                  Game {activeGame?.game_number ?? 1}, frame 1 starts on
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  {(["A", "B"] as const).map((side) => {
                    const lane = side === "A" ? laneA.trim() : laneB.trim();
                    return (
                      <Chip
                        key={side}
                        selected={startSide === side}
                        onClick={() => { setStartSide(side); void saveLanes(side); }}
                      >
                        {lane}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}

            {laneError && <p className="mt-2 text-xs text-danger-700">{laneError}</p>}
        </FormSheet>
      )}
    </div>
  );
}
