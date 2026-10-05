import { ChevronLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { ShareIosIcon } from "../components/icons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import { SaveCopyPrompt } from "../components/SaveCopyPrompt";
import { createPortal } from "react-dom";
import { ShareCardDialog } from "../components/ShareCardDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { OilPatternContext } from "../lib/oilPatternContext";
import { getBalls, getOilPattern } from "../services/ballRepository";
import { movementAt } from "../lib/briefing";
import { describeGameMove } from "../components/alleyHistoryCopy";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionHeaderText } from "../components/SessionHeaderText";
import { PushScreen } from "../components/PushScreen";
import { SessionLanePanel } from "../components/SessionLanePanel";
import {
  gameChipOn,
  tapGameChip,
  type PanelSelection,
  type SessionPanelTab
} from "../lib/sessionPanel";
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
import {
  SHARE_OFFER_KEY,
  answerShareOffer,
  parseShareOffer,
  shouldOfferShare
} from "../lib/shareOffer";
import { useHandedness } from "../lib/handednessContext";
import { useLongPress } from "../lib/useLongPress";
import {
  addNextGameToSession,
  deleteGame,
  getBackupNudgeState,
  getSessionDetails,
  getSessionHistory,
  getSetting,
  deleteFrame,
  saveFrame,
  setBackupNudgeSnoozedUntil,
  setSetting,
  updateGameLanes,
  updateSession
} from "../services/bowlingRepository";
import type { Frame, Game, OilPattern, SessionSummary } from "../types/bowling";
import { GROUP_HEADING } from "../components/ui/typography";
import type { UndoResult } from "../lib/frameController";
import { alleyLabel } from "../lib/sessionLabels";


/** How long a pushed screen takes to slide in (`animate-push-in` in index.css). */
const PUSH_IN_MS = 280;

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
  /**
   * `tab` (default) is the Active tab: the session you are bowling, with the
   * tab bar as its navigation. `push` is a session you are reading, pushed over
   * the list you opened it from, so it carries a nav bar and a back control
   * (ADR-084).
   */
  mode?: "tab" | "push";
}

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

// Games whose lane prompt has already auto-opened this app run. Module-level
// so the once-per-game rule survives tab switches (which remount this view).
const lanePromptedGameIds = new Set<number>();

// The game a ball recorded on this screen just finished, the only game the
// share offer is ever made for. Module-level so a tab switch, which remounts
// this view, does not lose a still-unanswered offer.
let justFinishedGameId: number | null = null;

// Games whose "you usually move" hint has been put away, this app run.
const gameHintDismissed = new Set<number>();

export function ActiveSessionView({
  sessionId,
  openStatsOnMount = false,
  onStatsOpened,
  initialGameId,
  initialBallId,
  onGameOpened,
  onBack,
  onSessionDeleted,
  onOpenArsenal,
  mode = "tab"
}: ActiveSessionViewProps) {
  const [sessionDetails, setSessionDetails] = useState<SessionSummary | null>(null);
  // The session's pattern in full, load table and all: the hydrated session only
  // carries the name and the link (ADR-037), and the lane needs the passes.
  const [oilPattern, setOilPattern] = useState<OilPattern | null>(null);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<number | null>(null);
  const [chipMenu, setChipMenu] = useState<{ gameId: number; left: number; top: number } | null>(null);
  // A game drill-down lands on the session sheet, scrolled to that game: the
  // question it was asked from ("what did this ball do in game 3") is answered
  // by the frames, not by the scorer parked on one of them.
  const [landOnSheet] = useState(openStatsOnMount || initialGameId != null);
  const [showSheet, setShowSheet] = useState(false);
  // Landing on the sheet is staged: the screen arrives first, and the sheet
  // rises once it has. Both at once (the push sliding in, the sheet sliding
  // up, and the scorer and the stats charts mounting in the same commit) is
  // what made opening a finished session stutter.
  const [landed, setLanded] = useState(false);
  // Captured at mount: the drill-down flags are one-shot, and the reset lands
  // in the same commit as the loaded session, so reading the prop later would
  // find it already cleared and the sheet would open with nothing lit.
  const [landingBallId] = useState(initialBallId);
  // A finished session opened from History lands on its stats: the scorecard
  // of a night already bowled is one tab along, and the numbers are what a
  // look back is for. A game drill-down still lands on the sheet, where the
  // frames it asked about are.
  const [sheetTab, setSheetTab] = useState<SessionPanelTab>(
    openStatsOnMount && initialGameId == null ? "stats" : "sheet"
  );
  // The game chosen with the chips while the panel is up (`tapGameChip`).
  const [panelSelection, setPanelSelection] = useState<PanelSelection>({ token: 0 });
  // Where the panel's top edge sits: just under the game chips, measured.
  const chipRowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [sheetTop, setSheetTop] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  // The screen is on its way out: the sheet slides down with it.
  const [leaving, setLeaving] = useState(false);
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
  // Persisted, so a relaunch does not re-ask (lib/shareOffer.ts).
  const shareOfferRaw = useLiveQuery(async () => ({ raw: await getSetting(SHARE_OFFER_KEY) }));
  const shareOfferState = shareOfferRaw ? parseShareOffer(shareOfferRaw.raw) : null;
  // As a new game starts at an alley with history, the move this bowler
  // usually makes into it (ADR-115). Read only while the game has no ball in
  // it: the query pulls every frame, and the hint is gone at the first ball.
  const hintGame = sessionDetails?.games.find((g) => g.id === activeGameId);
  const hintWanted =
    mode === "tab" &&
    !!hintGame?.id &&
    hintGame.game_number >= 2 &&
    !gameHintDismissed.has(hintGame.id) &&
    (hintGame as Game & { frames: Frame[] }).frames.every((f) => f.shots.length === 0) &&
    !!sessionDetails?.session.alley_name.trim();
  const hintAlley = hintWanted ? sessionDetails!.session.alley_name : "";
  const hintGameNumber = hintWanted ? hintGame!.game_number : 0;
  const gameHint = useLiveQuery(async () => {
    if (!hintAlley) return null;
    const [history, balls] = await Promise.all([getSessionHistory(), getBalls()]);
    return { alley: hintAlley, gameNumber: hintGameNumber, slots: movementAt(history, balls, hintAlley) };
  }, [hintAlley, hintGameNumber]);
  const [, setHintTick] = useState(0);

  // Mirrors the module-level id so finishing a game re-renders.
  const [finishedHere, setFinishedHere] = useState(justFinishedGameId);

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

  const loaded = sessionDetails != null;
  useEffect(() => {
    if (!landOnSheet || landed || !loaded) return;
    // A push waits out its own slide-in; a tab has none, so one frame for the
    // screen to paint is enough.
    const t = window.setTimeout(() => {
      setLanded(true);
      setShowSheet(true);
    }, mode === "push" ? PUSH_IN_MS : 16);
    return () => window.clearTimeout(t);
  }, [landOnSheet, landed, loaded, mode]);

  // The panel rises to just under the game chips, so it follows them: measured
  // when it opens, and again whenever anything could have moved them (a
  // rotation, the keyboard, a scroll of the page behind).
  useLayoutEffect(() => {
    if (!showSheet) return;
    const measure = () => {
      const row = chipRowRef.current;
      if (row) setSheetTop(Math.max(0, Math.round(row.getBoundingClientRect().bottom)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [showSheet, sessionDetails]);

  /** Open the panel on a tab, with the header scrolled back into view first:
   *  the panel stops under the chips, so they have to be on screen. */
  function openSheet(tab: SessionPanelTab) {
    revealHeader(headerRef.current);
    setSheetTab(tab);
    setShowSheet(true);
  }

  // The lane fields follow the stored game, except while the bowler is typing
  // in them. Each field saves on blur, and the refresh after that save hands
  // back a new `lanes` array: re-syncing on it replaced whatever was already in
  // the second box with the stored "" whenever the write was slower than the
  // move to the next field. A different game always re-syncs.
  const laneFieldsGameId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (showLaneEditor && laneFieldsGameId.current === activeGame?.id) return;
    laneFieldsGameId.current = activeGame?.id;
    const lanes = activeGame?.lanes ?? (activeGame?.lane_number ? [activeGame.lane_number] : []);
    setLaneA(lanes[0] ?? "");
    setLaneB(lanes[1] ?? "");
    setStartSide(activeGame?.start_lane && activeGame.start_lane === lanes[1] ? "B" : "A");
    setLaneError("");
  }, [activeGame?.id, activeGame?.lanes, activeGame?.lane_number, activeGame?.start_lane, showLaneEditor]);

  // Auto-open the lane editor at most once per game, and only while the game
  // has no recorded shots yet. Tab switches remount this view, without the
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

  // Follows the session's pattern id, so editing the session to a different
  // pattern re-draws the lane without a reload.
  const oilPatternId = sessionDetails?.session.oil_pattern_id;
  useEffect(() => {
    let isMounted = true;
    const read = oilPatternId == null ? Promise.resolve(undefined) : getOilPattern(oilPatternId);
    read
      .then((p) => { if (isMounted) setOilPattern(p ?? null); })
      .catch(() => { if (isMounted) setOilPattern(null); });
    return () => { isMounted = false; };
  }, [oilPatternId]);

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

  /** Persist an undo (ADR-079): rewrite the frame it changed, or delete the one
   *  it emptied. Either way the session is re-read, so the scorecard, the
   *  series total and the game chips all follow. */
  async function handleUndoShot(result: UndoResult) {
    if (!activeGame?.id) throw new Error("No active game selected.");
    if (result.changedFrame) await saveFrame(activeGame.id, result.changedFrame);
    else if (result.deletedFrameNumber !== null) {
      await deleteFrame(activeGame.id, result.deletedFrameNumber);
    }
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
        <ErrorBanner>{error || "No active game was found for this session."}</ErrorBanner>
        {/* A session with no game is a session waiting for one, so the way out
            of this screen is forward as well as back. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void handleAddGame()}>
            <Plus size={16} aria-hidden="true" />
            Add game
          </Button>
          <Button variant="secondary" onClick={onBack}>
            <ChevronLeft size={16} aria-hidden="true" />
            Back
          </Button>
        </div>
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
  // Average over completed games only, an in-progress game would drag it down.
  const finalScores = games.flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
  const seriesAvg = finalScores.length
    ? Math.round(finalScores.reduce((a, b) => a + b, 0) / finalScores.length)
    : null;

  // The card the share sheet draws. Built from the same numbers the header
  // shows, so the picture and the screen can never disagree.
  const sessionStats = calculateStats([sessionDetails], undefined, handedness);
  const shareCard = buildSessionCard({
    alleyName: alleyLabel(sessionDetails.session.alley_name),
    event: sessionDetails.session.description,
    date: sessionDetails.session.date,
    scores: games.map(
      (g) => g.final_score ?? calculateGameScore((g as Game & { frames: Frame[] }).frames).total
    ),
    finalScores,
    strikePct: sessionStats.strikePct,
    sparePct: sessionStats.sparePct
  });

  // The offer to share, made when a game is finished on this screen and
  // nowhere else (lib/shareOffer.ts), and never on top of the backup prompt:
  // one asks for something the user needs and the other for something
  // optional, so they must not compete for the same strip of screen.
  const offerShare =
    mode === "tab" &&
    shareOfferState != null &&
    saveCopyUrgency === "none" &&
    shouldOfferShare(
      shareOfferState,
      sessionId,
      finishedHere != null && finishedHere === activeGame.id && activeGame.final_score !== undefined
    );

  const gameHintText =
    hintWanted && gameHint && gameHint.gameNumber === activeGame.game_number
      ? describeGameMove(gameHint.slots, gameHint.gameNumber, handedness)
      : null;

  function answerShare(answer: "share" | "dismiss") {
    justFinishedGameId = null;
    setFinishedHere(null);
    if (shareOfferState) {
      void setSetting(
        SHARE_OFFER_KEY,
        JSON.stringify(answerShareOffer(shareOfferState, sessionId, answer))
      );
    }
    if (answer === "share") setShareOpen(true);
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

  const body = (
    <OilPatternContext.Provider value={oilPattern}>
    <div>
      <section ref={headerRef} className="mx-auto w-full max-w-5xl px-3 pt-2 sm:px-6">
        <div className="flex items-start gap-2">
          {/* Tapping the identity block opens the sheet; the oil-pattern link
              inside it stops propagation so it still opens the pattern PDF. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => openSheet("sheet")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openSheet("sheet");
              }
            }}
            className="min-w-0 flex-1 rounded-md hover:bg-surface-muted active:bg-surface-muted"
            aria-label="Open session sheet and lane notes"
          >
            <SessionHeaderText session={sessionDetails.session} games={games} />
          </div>
          {/* Two taps to the edit: the first brings up the session sheet, which
              is what the header is for, and the second, with the sheet up, opens
              the session's details. One pencil, one place, either way. */}
          <IconButton
            label={showSheet ? "Edit session" : "Session sheet"}
            title={showSheet ? "Edit session" : "Session sheet"}
            variant="round"
            className="shrink-0"
            onClick={() => {
              // The editor opens over the sheet rather than closing it: both are
              // portalled to the body, and the editor sits above.
              if (showSheet) setShowEdit(true);
              else openSheet("sheet");
            }}
          >
            <Pencil size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Share this session"
            variant="round"
            className="shrink-0"
            onClick={() => setShareOpen(true)}
          >
            <ShareIosIcon size={18} aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            onClick={() => openSheet("stats")}
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
        <div ref={chipRowRef} className="mt-2 flex items-center gap-2 overflow-x-auto py-1">
          {games.map((g) => {
            const frames = (g as Game & { frames: Frame[] }).frames;
            return (
              <Chip
                key={g.id}
                // With the panel up the chips are its chips: on the stats tab
                // the one scoping the numbers is on, elsewhere none are.
                selected={
                  showSheet ? gameChipOn(sheetTab, panelSelection, g.id) : g.id === activeGameId
                }
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
                  if (!g.id) return;
                  if (showSheet) {
                    const next = tapGameChip(sheetTab, panelSelection, g.id);
                    setSheetTab(next.tab);
                    setPanelSelection(next.selection);
                    return;
                  }
                  setActiveGameId(g.id);
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

        {gameHintText && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-edge bg-surface-muted p-3">
            <p className="flex-1 text-sm text-ink-strong">{gameHintText}</p>
            <IconButton
              label="Dismiss game hint"
              onClick={() => {
                gameHintDismissed.add(activeGame.id!);
                setHintTick((t) => t + 1);
              }}
              className="shrink-0"
            >
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        )}

        {/* Not a warning: accent, not amber. Nothing is at risk here, the app
            is only offering. */}
        {offerShare && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent-soft bg-accent-soft p-3">
            <p className="flex-1 text-sm font-semibold text-accent">
              Game {activeGame.game_number} is in the books. Share the session?
            </p>
            <button
              type="button"
              onClick={() => answerShare("share")}
              className={`relative shrink-0 text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
            >
              Share
            </button>
            {/* Named, not just "Dismiss": the line-capture prompt below it also has a
                dismiss, and two identical labels on one screen leave a screen
                reader user with no way to tell them apart. */}
            <IconButton label="Dismiss share offer" onClick={() => answerShare("dismiss")} className="shrink-0">
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
        onGameComplete={() => {
          justFinishedGameId = activeGame.id ?? null;
          setFinishedHere(justFinishedGameId);
        }}
        onUndoShot={handleUndoShot}
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


      {showSheet && (
        <SessionLanePanel
          summary={sessionDetails}
          currentGameId={activeGame.id}
          top={sheetTop}
          tab={sheetTab}
          onTabChange={setSheetTab}
          selection={panelSelection}
          onSelectionChange={setPanelSelection}
          highlightBallId={landingBallId}
          onSelectFrame={(gameId, frameNumber, shotIndex) => {
            setActiveGameId(gameId);
            setFocusFrame((prev) => ({ frameNumber, shotIndex, token: (prev?.token ?? 0) + 1 }));
            setShowSheet(false);
          }}
          onClose={() => setShowSheet(false)}
          active={!shareOpen && !showEdit}
          leaving={leaving}
        />
      )}

      {/* Portalled to the body, like the sheet, and above it: a dialog inside
          the pushed screen shares that screen's stacking context, and painted
          under the sheet whatever its z-index. Share and edit open over the
          sheet and leave it where it was. */}
      {createPortal(
        <ShareCardDialog
          open={shareOpen}
          card={shareCard}
          onClose={() => setShareOpen(false)}
        />,
        document.body
      )}

      {createPortal(<SessionFormDialog
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
      />, document.body)}

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

            {laneError && <ErrorBanner className="mt-2">{laneError}</ErrorBanner>}
        </FormSheet>
      )}
    </div>
    </OilPatternContext.Provider>
  );

  if (mode === "tab") return body;
  // "Session" rather than the alley: the identity block right underneath
  // already names the alley and the date, and a nav title that arrives a tick
  // after the screen does reads as the screen changing under the thumb.
  return (
    <PushScreen
      title="Session"
      onBack={onBack}
      // The sheet is portalled out of the screen, so it is told to go with it.
      onLeave={() => setLeaving(true)}
      active={
        !showSheet && !shareOpen && !showEdit && !showLaneEditor && confirmDeleteGame === null
      }
    >
      {body}
    </PushScreen>
  );
}

/**
 * Scroll the session header back into view inside whatever scrolls it, when it
 * has gone up under the top. Its own container rather than `scrollIntoView`,
 * which also scrolls the document and is how the viewport bug starts
 * (docs/VIEWPORT-BUG.md).
 */
function revealHeader(header: HTMLElement | null) {
  if (!header) return;
  let scroller = header.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return;
  const above = header.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  if (above < 0) scroller.scrollTop += above;
}
