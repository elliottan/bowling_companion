import { Hand, Plus, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  buildLiveFrame,
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  undoLastShot,
  type UndoResult,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, isStrike } from "../lib/scoring";
import { useHandedness } from "../lib/handednessContext";
import { isPocketHit } from "../lib/pins";
import { freshRackShotIndices, laneForFrame } from "../lib/lanes";
import { seedForShot, lineForBall } from "../lib/shotSeeding";
import { findSpareLineByPins, getBalls, getSpareLinesAll } from "../services/ballRepository";
import { getSetting, setSetting } from "../services/bowlingRepository";
import type {
  Ball,
  Frame,
  Game,
  LineSpec,
  PinNumber,
  ShotMetadata,
  SpareLine
} from "../types/bowling";
import { ConfirmDialog } from "./ConfirmDialog";
import { PinGrid } from "./PinGrid";

const NO_BALLS: Ball[] = [];
const NO_SPARE_LINES: SpareLine[] = [];
import { Scorecard } from "./Scorecard";
import { ShotDetailBar } from "./ShotDetailBar";
import { SpareLineFormDialog } from "./SpareLineFormDialog";
import { Button } from "./ui/Button";
import { TAP_TARGET_44 } from "./ui/Chip";
import { IconButton } from "./ui/IconButton";
import { GROUP_HEADING } from "./ui/typography";

/** "10-pin" for a single, "3-10" for multi. */
function formatLeavePins(pins: PinNumber[]): string {
  return pins.length === 1 ? `${pins[0]}-pin` : pins.join("-");
}


/** Written once the bowler has been told how the deck reads, or has finished a
 *  game and so plainly worked it out. */
const PIN_COACH_SEEN_KEY = "pin_input_coached_at";

/** Games whose "edit a finished game" prompt has already been answered. Module
 *  level, so it outlives the component the way the decision outlives the visit;
 *  a reload is a new session and asks again. */
const unlockedGames = new Set<string | number>();

export type ScorerMode = "standalone" | "session";

interface ActiveGameScorerProps {
  gameKey?: number | string;
  initialFrames?: Frame[];
  /** Recorded frames from OTHER games in the same session, oldest first. Used to
   *  reuse a per-session intended spare line for an identical leave. */
  sessionFrames?: Frame[];
  /** Earlier games in the session (oldest first), with lane config + frames.
   *  Used to carry line/ball/notes across games on the same physical lane. */
  previousGames?: Array<{
    game: Pick<Game, "lanes" | "start_lane" | "lane_number">;
    frames: Frame[];
  }>;
  mode?: ScorerMode;
  game?: Pick<Game, "lanes" | "start_lane" | "lane_number">;
  /** External request to review a recorded frame (e.g. tapped in the session
   *  sheet). Bump `token` to re-fire for the same frame. */
  focusFrame?: { frameNumber: number; shotIndex: number; token: number };
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
  /** Open the game-level lane editor (lane pair + starting lane). */
  onEditLanes?: () => void;
  /** Jump to the Arsenal screen to manage balls. */
  onOpenArsenal?: () => void;
  /** Persist an undo: rewrite the frame it changed, or delete the one it
   *  emptied. Absent in the standalone scorer, which stores nothing. */
  onUndoShot?: (result: UndoResult) => Promise<void> | void;
  /** The game being bowled, as opposed to one revisited from earlier in the
   *  session. It is never locked once complete. */
  isCurrentGame?: boolean;
}

/** Pins available entering a given shot of a frame (for editing a past shot). */
function availableEnteringShot(frame: Frame, shotIndex: number): PinNumber[] | undefined {
  if (shotIndex === 0) return undefined; // fresh rack, all pins available
  const prev = frame.shots[shotIndex - 1]?.pins_standing;
  return prev && prev.length > 0 ? prev : undefined;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  sessionFrames = [],
  previousGames = [],
  mode = "standalone",
  game,
  focusFrame,
  onFrameComplete,
  onGameComplete,
  onEditLanes,
  onOpenArsenal,
  onUndoShot,
  isCurrentGame = false
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() => hydrateFrameController(initialFrames));
  const [errorMessage, setErrorMessage] = useState("");
  // Live, not read once. The Arsenal is an overlay, so this screen stays
  // mounted while a ball is added and would otherwise never hear about it: a
  // bowler's first ball, added from "Add a ball" on this very screen, was
  // invisible until the app was reopened.
  const liveBalls = useLiveQuery(() => getBalls(), []);
  // Whole spare_lines table, held like `balls` so a leave lookup is
  // synchronous. An async lookup used to resolve *after* a ball change and
  // clobber the line it had just seeded.
  const liveSpareLines = useLiveQuery(() => getSpareLinesAll(), []);
  const balls = liveBalls ?? NO_BALLS;
  const spareLines = liveSpareLines ?? NO_SPARE_LINES;
  // Seeding reads both lists, so it has to wait for them. Resuming a game
  // mid-frame used to seed the spare attempt before `balls` arrived, which
  // meant the spare ball was never the one picked.
  const ballsReady = liveBalls !== undefined && liveSpareLines !== undefined;
  // Live (next-unbowled) shot draft. Only used when no recorded shot is selected.
  const [selectedBallId, setSelectedBallId] = useState<number | undefined>(undefined);
  const [intendedLine, setIntendedLine] = useState<LineSpec | undefined>(undefined);
  const [actualLine, setActualLine] = useState<LineSpec | undefined>(undefined);
  const [shotNotes, setShotNotes] = useState("");
  // Cursor: a recorded shot being edited inline (null = live entry).
  const [selectedShot, setSelectedShot] = useState<{ frameNumber: number; shotIndex: number } | null>(null);
  // Shot we last applied carry-forward defaults to (once per live shot).
  const lastDefaultedShot = useRef<string | null>(null);
  // True while the intended line is one this ball's history filled in, rather
  // than one the user typed or a carry-forward/spare line supplied. Only an
  // auto-filled line is recomputed when the ball changes underneath it.
  // A just-converted spare whose leave has no saved Spare Line, offered as a
  // dismissible banner so the line can be captured in the moment.
  const [pendingSpareLeave, setPendingSpareLeave] = useState<{
    pins: PinNumber[];
    line?: LineSpec;
    notes?: string;
  } | null>(null);
  const [showSpareLineDialog, setShowSpareLineDialog] = useState(false);
  // A finished game from earlier in the session is locked: the first edit
  // attempt raises a confirm instead of applying, so a stray pin tap does not
  // silently rewrite a shot on a game the bowler has moved on from. The game
  // being bowled is not locked, even once its tenth frame lands: it is the one
  // you are still standing at, undo is right there, and a confirm between a
  // bowler and the shot they just threw is in the way.
  const [unlocked, setUnlocked] = useState(false);
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  // Pocket verdict for the live shot when the bowler has overridden the
  // inference. Undefined means they have not touched it, so the rule stands.
  const [pocketOverride, setPocketOverride] = useState<boolean | undefined>(undefined);
  const handedness = useHandedness();

  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const lanesList = game?.lanes ?? (game?.lane_number ? [game.lane_number] : []);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  // Frame 1's lane for this game. Set per game: the house's system flips it
  // each game, and when it does not, this is the thing that needs correcting.
  const startLane = game ? laneForFrame(game, 1) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  /** Pins the current selection would knock down, in the inverted input model:
   *  shot 1 starts all-down and pins are tapped up, later shots start pins-up
   *  and are tapped down. Either way it is what is available minus what stands. */
  const pinsThisShot = gameState.availablePins.length - gameState.standingPins.length;


  const recordedFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;
  const recordedShot = recordedFrame && selectedShot ? recordedFrame.shots[selectedShot.shotIndex] ?? null : null;
  const isEditing = Boolean(recordedShot);
  const locked = gameState.isComplete && !unlocked && !isCurrentGame;
  /**
   * "Next" said nothing about what it was about to record, which on a button
   * that commits a shot is the one thing it has to say (DESIGN-LANGUAGE §8).
   * It names the count instead, except when the deck reads as the strike or
   * spare that the button next to it already offers.
   */
  const nextLabel = (() => {
    if (isEditing) return "Next";
    if (pinsThisShot === 0) return "Gutter";
    // A full deck is what the button beside this one records, and two adjacent
    // buttons with the same word on them is worse than one that says "Next".
    if (pinsThisShot === gameState.availablePins.length) return "Next";
    return `Count ${pinsThisShot}`;
  })();

  /** Nothing to take back on an untouched game. */
  const canUndo = gameState.frames.some((frame) => frame.shots.length > 0);

  // Wrapped, so "the query has not answered" is distinguishable from "the key
  // is unset" and the line does not flash onto every scorer that opens.
  const pinCoach = useLiveQuery(async () => ({ seenAt: await getSetting(PIN_COACH_SEEN_KEY) }));
  const showPinCoach = !!pinCoach && !pinCoach.seenAt;

  /** Gate every user edit on a completed game. Returns false (and raises the
   *  prompt) while locked; the caller must drop the edit. */
  function requestEdit(): boolean {
    if (!locked) return true;
    setShowEditPrompt(true);
    return false;
  }

  // Label for the primary button: "Strike" on a fresh rack (first ball or a
  // 10th-frame bonus ball), "Spare" when shooting at a leave. While editing,
  // derive from the pins available entering the selected shot.
  const editStrikeOrSpareLabel = (() => {
    if (isEditing && recordedFrame && selectedShot) {
      const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
      return (avail?.length ?? 10) === 10 ? "Strike" : "Spare";
    }
    return isFreshRack ? "Strike" : "Spare";
  })();

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setErrorMessage("");
    setSelectedShot(null);
    // Answered once per game for as long as the app is open, not once per
    // visit. Crossing to another game and back is not a new decision, and being
    // asked again on the way back reads as the app forgetting.
    setUnlocked(unlockedGames.has(gameKey));
    setShowEditPrompt(false);
    lastDefaultedShot.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  // The first ball in the bag goes straight onto the live shot. It was added
  // from this screen, by a bowler who came to pick it, and asking them to pick
  // it a second time read as the add having failed.
  const previousBallCount = useRef<number | null>(null);
  useEffect(() => {
    if (!ballsReady) return;
    const before = previousBallCount.current;
    previousBallCount.current = balls.length;
    if (before === 0 && balls.length === 1 && selectedShot === null && selectedBallId === undefined) {
      setSelectedBallId(balls[0].id);
    }
  }, [ballsReady, balls, selectedShot, selectedBallId]);


  // Push the live draft into the controller's currentShotMeta.
  useEffect(() => {
    const meta: ShotMetadata = {
      ball_id: selectedBallId,
      intended: intendedLine,
      actual: actualLine,
      notes: shotNotes.trim() || undefined
    };
    setGameState((curr) => updateShotMeta(curr, meta));
  }, [selectedBallId, intendedLine, actualLine, shotNotes]);

  // On completion, default to reviewing/editing the final frame's last shot.
  useEffect(() => {
    if (gameState.isComplete && selectedShot === null) {
      const tenth = gameState.frames.find((f) => f.frame_number === 10);
      if (tenth && tenth.shots.length > 0) {
        setSelectedShot({ frameNumber: 10, shotIndex: tenth.shots.length - 1 });
      }
    }
  }, [gameState.isComplete, gameState.frames, selectedShot]);

  // Select the requested frame's last recorded shot. Declared after the
  // completed-game default so its selection wins when both fire.
  // Reads `initialFrames`, not
  // `gameState`: when the request also switches games, the hydrate above hasn't
  // been applied yet and `gameState` still holds the outgoing game.
  useEffect(() => {
    if (!focusFrame) return;
    const frame = initialFrames.find((f) => f.frame_number === focusFrame.frameNumber);
    if (!frame || frame.shots.length === 0) return;
    setSelectedShot({
      frameNumber: frame.frame_number,
      shotIndex: Math.min(focusFrame.shotIndex, frame.shots.length - 1)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFrame?.token]);

  /** Live-entry ball change. The box shows the line for the ball that is
   *  selected: this ball's line if we know one, otherwise whatever is already
   *  there, so an unfamiliar ball inherits a starting point to adjust off. */
  function handleLiveBallChange(ballId: number | undefined) {
    setSelectedBallId(ballId);
    const currentFrame = gameState.frames.find(
      (f) => f.frame_number === gameState.currentFrameNumber
    );
    const found = lineForBall(
      {
        currentFrameNumber: gameState.currentFrameNumber,
        frames: gameState.frames,
        game,
        previousGames,
        sessionFrames,
        spareLines,
        balls
      },
      ballId,
      currentFrame?.shots ?? [],
      gameState.availablePins.length < 10 ? gameState.availablePins : undefined
    );
    if (found) setIntendedLine(found);
  }

  // Per-shot defaults (live entry only): notes + actual always blank; intended and
  // ball are carried by context. See ADR-017 for the full carry-rule priority.
  useEffect(() => {
    if (selectedShot !== null || gameState.isComplete || !ballsReady) return;
    const key = `${gameState.currentFrameNumber}-${gameState.currentShot}`;
    if (lastDefaultedShot.current === key) return;
    lastDefaultedShot.current = key;

    setShotNotes("");
    setActualLine(undefined);
    setPocketOverride(undefined);

    const currentFrame = gameState.frames.find(
      (f) => f.frame_number === gameState.currentFrameNumber
    );

    // The rules themselves live in lib/shotSeeding.ts, tested there; this only
    // applies what they decide.
    const seed = seedForShot({
      currentShot: gameState.currentShot,
      currentFrameNumber: gameState.currentFrameNumber,
      availablePins: gameState.availablePins,
      frames: gameState.frames,
      currentFrameShots: currentFrame?.shots ?? [],
      game,
      previousGames,
      sessionFrames,
      balls,
      spareLines
    });

    setShotNotes(seed.notes);
    setSelectedBallId(seed.ballId);
    setIntendedLine(seed.intended);
  }, [
    ballsReady,
    gameState.currentFrameNumber,
    gameState.currentShot,
    gameState.availablePins,
    gameState.isComplete,
    gameState.frames,
    selectedShot,
    sessionFrames,
    previousGames,
    balls,
    spareLines,
    game
  ]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  async function persistFrame(frame: Frame) {
    try {
      await onFrameComplete?.(frame);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  // Edit a recorded shot's metadata only, no cascade, other shots untouched.
  function handleEditMeta(meta: ShotMetadata) {
    if (!selectedShot || locked) return;
    const { frameNumber, shotIndex } = selectedShot;
    const frames = editFrameShotMeta(gameState.frames, frameNumber, shotIndex, meta);
    setGameState((s) => ({ ...s, frames }));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // Edit a recorded shot's pins, re-derive the frame, rescore, persist.
  function handleEditPins(pins: PinNumber[]) {
    if (!selectedShot || locked) return;
    const { frameNumber } = selectedShot;
    const frames = editFrameShotPins(gameState.frames, frameNumber, selectedShot.shotIndex, pins);
    setGameState(hydrateFrameController(frames));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // After a live spare attempt, offer to capture the line it was thrown on when
  // the leave has no saved Spare Line (or only a bare row with no targeting
  // data). Made or missed: the bowler judges whether the line was right, and a
  // miss you know the cause of is still the line you want written down
  // (ADR-054). Prefilled with what was actually thrown, so the common case is
  // one tap.
  function offerSpareLine(frame: Frame) {
    if (isStrike(frame)) return;
    const leave = frame.shots[0]?.pins_standing;
    const attempt = frame.shots[1];
    if (!leave || leave.length === 0 || !attempt) return;
    const existing = findSpareLineByPins(spareLines, leave);
    if (existing?.line) return;
    setPendingSpareLeave({
      pins: [...leave].sort((a, b) => a - b) as PinNumber[],
      line: attempt.intended,
      notes: existing?.notes
    });
  }

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submittedFrameNumber = gameState.currentFrameNumber;
    // Materialize the pocket verdict the bowler was looking at: the inference
    // unless they flipped it. Only a fresh-rack ball has a pocket to hit, and
    // the Strike button records the inference (true) without a pause, so a
    // crossover strike is corrected by editing the frame (ADR-046).
    const pocket = isFreshRack
      ? { pocket_hit: pocketOverride ?? isPocketHit(standing, handedness) }
      : {};
    const submission = submitShot(
      { ...gameState, currentShotMeta: { ...gameState.currentShotMeta, ...pocket } },
      standing
    );
    setGameState(submission.state);
    const frameToPersist =
      submission.savedFrame ??
      submission.state.frames.find((f) => f.frame_number === submittedFrameNumber) ??
      null;
    if (submission.savedFrame) offerSpareLine(submission.savedFrame);
    if (!frameToPersist) return;
    try {
      await onFrameComplete?.(frameToPersist);
      if (submission.state.isComplete) {
        // A finished game is proof the deck was read correctly ten frames in a
        // row, so the coach line retires itself rather than waiting to be
        // dismissed on every future game.
        await setSetting(PIN_COACH_SEEN_KEY, new Date().toISOString());
        await onGameComplete?.(submission.state.frames);
      }
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  /**
   * Take the last recorded shot back (ADR-079). The position afterwards is
   * re-derived by `hydrateFrameController`, the same function that answers
   * "where were we" after a reload, so an undo can never leave the scorer
   * somewhere a resume would not.
   */
  async function undoShot() {
    const result = undoLastShot(gameState.frames);
    if (!result.changedFrame && result.deletedFrameNumber === null) return;

    setGameState(hydrateFrameController(result.frames));
    setSelectedShot(null);
    setPendingSpareLeave(null);
    try {
      await onUndoShot?.(result);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Undo failed.");
    }
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
    setSelectedShot(null);
    setErrorMessage("");
    lastDefaultedShot.current = null;
  }

  function selectShot(frameNumber: number, shotIndex: number) {
    setSelectedShot({ frameNumber, shotIndex });
  }

  function goLive() {
    setSelectedShot(null);
  }

  // The pocket toggle belongs to fresh-rack balls only: a shot at a leave has
  // no pocket to hit.
  const pocketShotIsFresh =
    isEditing && recordedFrame && selectedShot
      ? freshRackShotIndices(recordedFrame.shots).includes(selectedShot.shotIndex)
      : isFreshRack;

  const pocketValue =
    isEditing && recordedShot
      ? recordedShot.pocket_hit ?? isPocketHit(recordedShot.pins_standing, handedness)
      : pocketOverride ?? isPocketHit(gameState.standingPins, handedness);

  function togglePocket() {
    if (!requestEdit()) return;
    const next = !pocketValue;
    if (isEditing) handleEditMeta({ pocket_hit: next });
    else setPocketOverride(next);
  }

  const viewedLane = selectedShot && game ? laneForFrame(game, selectedShot.frameNumber) : undefined;
  // The frame the lane chips describe: the recorded shot under review, or the
  // live one.
  const shownFrameNumber = selectedShot ? selectedShot.frameNumber : gameState.currentFrameNumber;

  const highlightCell = selectedShot
    ? { frameNumber: selectedShot.frameNumber, shotIndex: selectedShot.shotIndex }
    : { frameNumber: gameState.currentFrameNumber, shotIndex: gameState.currentShot - 1 };

  // Provisional symbol for the in-progress (live) shot, shown in the scorecard
  // and updated as the user taps the pin deck. A fresh rack counts knocked-down
  // pins (X on a clean sweep); a partial leave counts cleared pins (/ on a spare).
  const liveSymbol = (() => {
    if (isEditing || gameState.isComplete) return undefined;
    const avail = gameState.availablePins;
    const standing = gameState.standingPins;
    const fresh = avail.length === 10;
    // Stay blank until the user taps the deck for this shot. The default (no tap)
    // is all pins standing-up on a fresh rack and all pins up on a partial leave.
    const interacted = fresh ? standing.length > 0 : standing.length < avail.length;
    if (!interacted) return undefined;
    const knocked = fresh ? 10 - standing.length : avail.length - standing.length;
    if (fresh) return knocked === 0 ? "-" : String(knocked);
    return knocked === avail.length ? "/" : knocked === 0 ? "-" : String(knocked);
  })();

  // Flush the live (un-submitted) shot when the game changes or the component
  // unmounts, and on page-hide / tab background. The ref is refreshed in a
  // post-commit effect (not during render) so the gameKey cleanup below, which
  // runs BEFORE the next render's effects, reads the OUTGOING game's state
  // paired with its matching onFrameComplete. Assigning during render would pair
  // the outgoing game's shot with the incoming game's handler (writes to the
  // wrong game).
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      if (selectedShot !== null || gameState.isComplete) return;
      // Skip a fresh rack with no interaction (ambiguous: strike vs un-bowled).
      if (gameState.availablePins.length === 10 && liveSymbol === undefined) return;
      const hasInput =
        liveSymbol !== undefined ||
        selectedBallId != null ||
        intendedLine != null ||
        actualLine != null ||
        shotNotes.trim() !== "";
      if (!hasInput) return;
      const frame = buildLiveFrame(gameState);
      if (frame) void onFrameComplete?.(frame);
    };
  });

  useEffect(() => {
    return () => { flushRef.current(); };
  }, [gameKey]);

  useEffect(() => {
    const onHide = () => flushRef.current();
    window.addEventListener("pagehide", onHide);
    const onVis = () => { if (document.hidden) flushRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Once the live shot has a value, fold it into the scoring frames so a prior
  // pending strike/spare resolves and shows its total, even though the current
  // frame itself stays blank until it is settled.
  const scoreFrames = (() => {
    if (liveSymbol === undefined) return gameState.frames;
    const fn = gameState.currentFrameNumber;
    const shotIdx = gameState.currentShot - 1;
    const existing = gameState.frames.find((f) => f.frame_number === fn);
    const baseShots = existing ? existing.shots.slice(0, shotIdx) : [];
    const provisional: Frame = {
      game_id: existing?.game_id ?? 0,
      frame_number: fn,
      shots: [...baseShots, { pins_standing: gameState.standingPins }],
      is_strike: false,
      is_spare: false
    };
    return [...gameState.frames.filter((f) => f.frame_number !== fn), provisional].sort(
      (a, b) => a.frame_number - b.frame_number
    );
  })();

  const detailKey = isEditing && selectedShot
    ? `r-${selectedShot.frameNumber}-${selectedShot.shotIndex}`
    : `live-${gameState.currentFrameNumber}-${gameState.currentShot}`;

  // Leave the viewed shot faces: live entry uses the current available pins;
  // editing derives from the pins entering the selected shot. Fresh rack ⇒ none.
  const shownLeave = (() => {
    if (isEditing && recordedFrame && selectedShot) {
      const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
      return avail && avail.length < 10 ? avail : undefined;
    }
    return gameState.availablePins.length < 10 ? gameState.availablePins : undefined;
  })();

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-6">
      {mode === "standalone" && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={newGame}>
            New
          </Button>
          <p className="text-2xl font-extrabold leading-none text-accent">{gameScore.total}</p>
        </div>
      )}

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
        gameComplete={gameState.isComplete}
        highlightCell={highlightCell}
        liveSymbol={liveSymbol}
        scoreFrames={scoreFrames}
        onShotTap={selectShot}
        onLiveTap={gameState.isComplete ? undefined : goLive}
      />

      {/* The one thing in the app that cannot be guessed: the deck starts
          with everything down and you tap what is still up (ADR-006). Every
          other scorer works the other way round, so a new bowler taps the
          pins they knocked over and records the opposite of what happened.
          It sits directly above the deck it describes, and goes for good on
          the first finished game or the first "Got it". */}
      {showPinCoach && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-accent-fill bg-accent-soft p-3 text-sm text-ink">
          <Hand size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Tap the pins left standing after your shot.</p>
            <button
              type="button"
              onClick={() => void setSetting(PIN_COACH_SEEN_KEY, new Date().toISOString())}
              className={`relative mt-1 text-xs font-bold text-accent underline hover:no-underline ${TAP_TARGET_44}`}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-3 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          {(onEditLanes || lanesList.length > 0) && (
            <div className="flex items-center justify-between rounded-lg border border-edge bg-surface px-2.5 py-1.5">
              {/* The chips mark the lane of the frame in the cursor, not the
                  game's starting lane. Unlabelled, a lit "7" on a game that
                  starts on 8 reads as a contradiction of the lane editor, so
                  the frame it is talking about is named here. */}
              <span className={`flex items-baseline gap-1 ${GROUP_HEADING}`}>
                Lane
                {lanesList.length > 1 && (
                  <span className="font-bold normal-case tracking-normal text-ink-tertiary">
                    F{shownFrameNumber}
                  </span>
                )}
              </span>
              {onEditLanes ? (
                <button
                  type="button"
                  onClick={() => { if (requestEdit()) onEditLanes(); }}
                  aria-label={
                    startLane && lanesList.length > 1
                      ? `Edit game lanes. Frame 1 starts on lane ${startLane}`
                      : "Edit game lanes"
                  }
                  className={`relative inline-flex items-center gap-1 ${TAP_TARGET_44}`}
                >
                  {lanesList.length > 0 ? (
                    lanesList.map((l) => (
                      <span
                        key={l}
                        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${
                          l === (isEditing ? viewedLane : currentLane) ? "bg-accent-fill text-accent-on-fill" : "bg-surface-muted text-ink-secondary"
                        }`}
                      >
                        {l}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-accent-fill px-1.5 text-xs font-semibold text-accent">
                      <Plus size={12} aria-hidden="true" />
                      Set lanes
                    </span>
                  )}
                </button>
              ) : (
                <span className="text-sm font-bold text-ink">{lanesList.join(" / ")}</span>
              )}
            </div>
          )}

          <PinGrid
            standingPins={isEditing && recordedShot ? recordedShot.pins_standing : gameState.standingPins}
            availablePins={
              isEditing && recordedFrame && selectedShot
                ? availableEnteringShot(recordedFrame, selectedShot.shotIndex)
                : gameState.availablePins
            }
            onChange={(pins) => {
              if (!requestEdit()) return;
              if (isEditing) handleEditPins(pins);
              else updateStandingPins(pins);
            }}
            size="sm"
            cornerSlot={
              pocketShotIsFresh ? (
                <button
                  type="button"
                  onClick={togglePocket}
                  aria-pressed={pocketValue}
                  aria-label={pocketValue ? "Pocket hit" : "Not a pocket hit"}
                  className={`rounded-md border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide ${
                    pocketValue
                      ? "border-accent-fill bg-accent-fill text-accent-on-fill"
                      : "border-[#9c7438] bg-[#c79b5e] text-[#7a5a2c] line-through"
                  }`}
                >
                  Pocket
                </button>
              ) : undefined
            }
          />

          {/* Strike/Spare + Next stay visible and functional in both live and
              editing states (every frame is editable). While editing a recorded
              shot, Strike/Spare applies that mark and Next leaves it untouched,
              both then jump the cursor back to the latest incomplete frame. */}
          {/* Undo stays after the tenth: taking the last ball back is exactly
              what a bowler wants from a game that just finished wrong. */}
          <div className="flex gap-2">
            {!gameState.isComplete && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      handleEditPins([]);
                      goLive();
                    } else {
                      void recordShot([]);
                    }
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-accent-fill text-sm font-bold text-accent-on-fill shadow-sm hover:bg-accent-fill-hover"
                >
                  {editStrikeOrSpareLabel}
                </button>
                <button
                  type="button"
                  onClick={() => (isEditing ? goLive() : void recordShot())}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent-fill bg-surface text-sm font-semibold text-accent hover:bg-surface-muted"
                >
                  {nextLabel}
                </button>
              </>
            )}
            {onUndoShot && canUndo && (
              <IconButton
                onClick={() => void undoShot()}
                label="Undo last shot"
                variant="round"
                className={gameState.isComplete ? "ml-auto" : ""}
              >
                <Undo2 size={20} aria-hidden="true" />
              </IconButton>
            )}
          </div>

        </div>

        <ShotDetailBar
          key={detailKey}
          balls={balls}
          ballId={isEditing && recordedShot ? recordedShot.ball_id : selectedBallId}
          onBallChange={
            isEditing ? (id) => handleEditMeta({ ball_id: id }) : handleLiveBallChange
          }
          intended={isEditing && recordedShot ? recordedShot.intended : intendedLine}
          onIntendedChange={
            isEditing
              ? (l) => handleEditMeta({ intended: l })
              : setIntendedLine
          }
          actual={isEditing && recordedShot ? recordedShot.actual : actualLine}
          onActualChange={isEditing ? (l) => handleEditMeta({ actual: l }) : setActualLine}
          notes={isEditing && recordedShot ? recordedShot.notes ?? "" : shotNotes}
          spareLeave={shownLeave}
          spareLines={spareLines}
          onEditAttempt={requestEdit}
          locked={locked}
          editPromptOpen={showEditPrompt}
          onNotesChange={
            // Store raw while typing (keeps internal/trailing spaces); the
            // textarea's onBlur trims on save. Trimming per-keystroke here made
            // it impossible to type a space in a recorded shot's notes.
            isEditing ? (n) => handleEditMeta({ notes: n }) : setShotNotes
          }
          onOpenArsenal={onOpenArsenal}
        />
      </div>

      {/* Full width, under both columns: it speaks about the shot just thrown,
          not about either column, and it wraps to three cramped lines squeezed
          into one of them. */}
      {pendingSpareLeave && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent-fill bg-felt-50 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowSpareLineDialog(true)}
            className="min-w-0 flex-1 text-left text-sm font-semibold text-accent"
          >
            Save this as your line for {formatLeavePins(pendingSpareLeave.pins)}
          </button>
          <IconButton
            label="Dismiss"
            onClick={() => setPendingSpareLeave(null)}
            className="shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {errorMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-danger-700">{errorMessage}</p>
      )}

      <ConfirmDialog
        open={showEditPrompt}
        title="Edit this completed game?"
        message="This game is finished. Changing a recorded shot cannot be undone."
        confirmLabel="Edit"
        onConfirm={() => {
          unlockedGames.add(gameKey);
          setUnlocked(true);
          setShowEditPrompt(false);
        }}
        onCancel={() => setShowEditPrompt(false)}
      />

      {showSpareLineDialog && pendingSpareLeave && (
        <SpareLineFormDialog
          key={pendingSpareLeave.pins.join("-")}
          initialPins={pendingSpareLeave.pins}
          lockPins
          initialLine={pendingSpareLeave.line}
          initialNotes={pendingSpareLeave.notes}
          onSaved={() => {
            setShowSpareLineDialog(false);
            setPendingSpareLeave(null);
          }}
          onCancel={() => setShowSpareLineDialog(false)}
        />
      )}
    </section>
  );
}
