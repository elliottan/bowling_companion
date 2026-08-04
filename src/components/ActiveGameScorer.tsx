import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildLiveFrame,
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, isSpare } from "../lib/scoring";
import { freshRackSeedShot, laneForFrame, lineHasValue, sameBallSeedLine } from "../lib/lanes";
import { findSpareLineByPins, getBalls, getSpareLinesAll } from "../services/ballRepository";
import type {
  Ball,
  Frame,
  Game,
  LineSpec,
  PinNumber,
  Shot,
  ShotMetadata,
  SpareLine
} from "../types/bowling";
import { ConfirmDialog } from "./ConfirmDialog";
import { PinGrid } from "./PinGrid";
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
}

const pinsKey = (p: PinNumber[]) => [...p].sort((a, b) => a - b).join(",");

/**
 * The intended line of the most recent earlier spare attempt this session that
 * faced the same leave. Scans non-10th frames (keyed by the leave standing pins);
 * returns the last match's intended line, or undefined.
 */
function sessionSpareIntended(frames: Frame[], leave: PinNumber[]): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    if (f.frame_number === 10) continue;
    const first = f.shots[0];
    const second = f.shots[1];
    if (!first || !second) continue;
    if (pinsKey(first.pins_standing) !== key) continue;
    if (lineHasValue(second.intended)) found = second.intended;
  }
  return found;
}

/** Pins available entering a given shot of a frame (for editing a past shot). */
function availableEnteringShot(frame: Frame, shotIndex: number): PinNumber[] | undefined {
  if (shotIndex === 0) return undefined; // fresh rack — all pins available
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
  onOpenArsenal
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() => hydrateFrameController(initialFrames));
  const [errorMessage, setErrorMessage] = useState("");
  const [balls, setBalls] = useState<Ball[]>([]);
  // Whole spare_lines table, held in state like `balls` so a leave lookup is
  // synchronous. An async lookup used to resolve *after* a ball change and
  // clobber the line it had just seeded.
  const [spareLines, setSpareLines] = useState<SpareLine[]>([]);
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
  const lineAutoFilled = useRef(false);
  // A just-converted spare whose leave has no saved Spare Line — offered as a
  // dismissible banner so the line can be captured in the moment.
  const [pendingSpareLeave, setPendingSpareLeave] = useState<{ pins: PinNumber[]; notes?: string } | null>(null);
  const [showSpareLineDialog, setShowSpareLineDialog] = useState(false);
  // A finished game is locked: the first edit attempt raises a confirm prompt
  // instead of applying, so a stray pin tap can't silently rewrite a recorded
  // shot (there is no undo). Confirming unlocks the rest of the visit;
  // cancelling leaves it locked so the next attempt asks again. Moving to
  // another game (gameKey) re-locks.
  const [unlocked, setUnlocked] = useState(false);
  const [showEditPrompt, setShowEditPrompt] = useState(false);

  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const lanesList = game?.lanes ?? (game?.lane_number ? [game.lane_number] : []);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  const recordedFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;
  const recordedShot = recordedFrame && selectedShot ? recordedFrame.shots[selectedShot.shotIndex] ?? null : null;
  const isEditing = Boolean(recordedShot);
  const locked = gameState.isComplete && !unlocked;

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
    setUnlocked(false);
    setShowEditPrompt(false);
    lastDefaultedShot.current = null;
    lineAutoFilled.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
    getSpareLinesAll().then(setSpareLines).catch(() => {});
  }, []);


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

  /** This ball's own history as a line source, for an otherwise-empty box. */
  function ballHistoryLine(ballId: number | undefined, currentFrameShots: Shot[]) {
    const found = sameBallSeedLine(
      ballId,
      game,
      gameState.currentFrameNumber,
      currentFrameShots,
      gameState.frames,
      previousGames
    );
    return found ? { ...found } : undefined;
  }

  /** Fill the intended line for a live shot: the caller's preset (carry-forward
   *  or spare line) wins; an empty box falls back to this ball's history and is
   *  flagged auto-filled so a later ball change can replace it (ADR-035). */
  function seedIntendedLine(
    preset: LineSpec | undefined,
    ballId: number | undefined,
    currentFrameShots: Shot[]
  ) {
    if (lineHasValue(preset)) {
      lineAutoFilled.current = false;
      setIntendedLine(preset);
      return;
    }
    const fallback = ballHistoryLine(ballId, currentFrameShots);
    lineAutoFilled.current = !!fallback;
    setIntendedLine(fallback);
  }

  /** Live-entry ball change. Re-seeds the line when the box is empty or still
   *  holds an auto-filled guess made for the ball being replaced. */
  function handleLiveBallChange(ballId: number | undefined) {
    setSelectedBallId(ballId);
    if (lineHasValue(intendedLine) && !lineAutoFilled.current) return;
    const currentFrame = gameState.frames.find(
      (f) => f.frame_number === gameState.currentFrameNumber
    );
    const fallback = ballHistoryLine(ballId, currentFrame?.shots ?? []);
    lineAutoFilled.current = !!fallback;
    setIntendedLine(fallback);
  }

  // Per-shot defaults (live entry only): notes + actual always blank; intended and
  // ball are carried by context. See ADR-017 for the full carry-rule priority.
  useEffect(() => {
    if (selectedShot !== null || gameState.isComplete) return;
    const key = `${gameState.currentFrameNumber}-${gameState.currentShot}`;
    if (lastDefaultedShot.current === key) return;
    lastDefaultedShot.current = key;

    setShotNotes("");
    setActualLine(undefined);

    const spareBall = balls.find((b) => b.is_spare_ball);
    const currentFrame = gameState.frames.find(
      (f) => f.frame_number === gameState.currentFrameNumber
    );

    if (gameState.currentShot === 1) {
      // First ball: carry line + ball + notes from the previous same-lane
      // frame in THIS game, else from the previous game on the same lane,
      // else leave everything blank/unselected.
      const prevShot = freshRackSeedShot(
        game,
        gameState.currentFrameNumber,
        [],
        gameState.frames,
        previousGames
      );
      setShotNotes(prevShot?.notes ?? "");
      setSelectedBallId(prevShot?.ball_id);
      seedIntendedLine(prevShot?.intended, prevShot?.ball_id, []);
    } else if (gameState.availablePins.length < 10) {
      // True second ball (spare attempt): ball = spare ball if configured,
      // else carry shot-1's ball. Line from session/saved spare line.
      const shotOneBall = currentFrame?.shots[0]?.ball_id;
      const ballId = spareBall?.id ?? shotOneBall;
      setSelectedBallId(ballId);

      const leave = gameState.availablePins;
      const sessionLine = sessionSpareIntended(
        [...sessionFrames, ...gameState.frames],
        leave
      );
      const saved = findSpareLineByPins(spareLines, leave)?.line;
      const savedLine = saved
        ? {
            ...(saved.stance != null && { stance: saved.stance }),
            ...(saved.target != null && { target: saved.target })
          }
        : undefined;
      const preset =
        (sessionLine && { ...sessionLine }) ??
        (savedLine && Object.keys(savedLine).length ? savedLine : undefined);
      seedIntendedLine(preset, ballId, currentFrame?.shots ?? []);
    } else {
      // Fresh-rack bonus ball (10th after strike/spare): carry line + ball
      // from the most recent fresh-rack shot (see ADR-029).
      const prevShot = freshRackSeedShot(
        game,
        gameState.currentFrameNumber,
        currentFrame?.shots ?? [],
        gameState.frames,
        previousGames
      );
      setSelectedBallId(prevShot?.ball_id);
      seedIntendedLine(prevShot?.intended, prevShot?.ball_id, currentFrame?.shots ?? []);
    }
    // seedIntendedLine is redeclared every render and only ever reads the
    // arguments it is handed here, so listing it would re-seed the line on
    // every render and stamp on what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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

  // Edit a recorded shot's metadata only — no cascade, other shots untouched.
  function handleEditMeta(meta: ShotMetadata) {
    if (!selectedShot || locked) return;
    const { frameNumber, shotIndex } = selectedShot;
    const frames = editFrameShotMeta(gameState.frames, frameNumber, shotIndex, meta);
    setGameState((s) => ({ ...s, frames }));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // Edit a recorded shot's pins — re-derive the frame, rescore, persist.
  function handleEditPins(pins: PinNumber[]) {
    if (!selectedShot || locked) return;
    const { frameNumber } = selectedShot;
    const frames = editFrameShotPins(gameState.frames, frameNumber, selectedShot.shotIndex, pins);
    setGameState(hydrateFrameController(frames));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // After a live spare conversion, offer to capture its line when the leave has
  // no saved Spare Line (or only a bare row with no targeting data).
  function offerSpareLine(frame: Frame) {
    if (!isSpare(frame)) return;
    const leave = frame.shots[0]?.pins_standing;
    if (!leave || leave.length === 0) return;
    const existing = findSpareLineByPins(spareLines, leave);
    if (existing?.line) return;
    setPendingSpareLeave({
      pins: [...leave].sort((a, b) => a - b) as PinNumber[],
      notes: existing?.notes
    });
  }

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submittedFrameNumber = gameState.currentFrameNumber;
    const submission = submitShot(gameState, standing);
    setGameState(submission.state);
    const frameToPersist =
      submission.savedFrame ??
      submission.state.frames.find((f) => f.frame_number === submittedFrameNumber) ??
      null;
    if (submission.savedFrame) offerSpareLine(submission.savedFrame);
    if (!frameToPersist) return;
    try {
      await onFrameComplete?.(frameToPersist);
      if (submission.state.isComplete) await onGameComplete?.(submission.state.frames);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
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

  const viewedLane = selectedShot && game ? laneForFrame(game, selectedShot.frameNumber) : undefined;

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
  // unmounts — and on page-hide / tab background. The ref is refreshed in a
  // post-commit effect (not during render) so the gameKey cleanup below — which
  // runs BEFORE the next render's effects — reads the OUTGOING game's state
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
  // pending strike/spare resolves and shows its total — even though the current
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
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      {mode === "standalone" && (
        <div className="mb-3 flex items-center justify-between gap-3">
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

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          {(onEditLanes || lanesList.length > 0) && (
            <div className="flex items-center justify-between rounded-lg border border-edge bg-surface px-2.5 py-1.5">
              <span className={GROUP_HEADING}>Lane</span>
              {onEditLanes ? (
                <button
                  type="button"
                  onClick={() => { if (requestEdit()) onEditLanes(); }}
                  aria-label="Edit game lanes"
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
                    <span className="text-xs font-semibold text-accent">+ Set lanes</span>
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
          />

          {/* Strike/Spare + Next stay visible and functional in both live and
              editing states (every frame is editable). While editing a recorded
              shot, Strike/Spare applies that mark and Next leaves it untouched —
              both then jump the cursor back to the latest incomplete frame. */}
          {!gameState.isComplete ? (
            <div className="flex gap-2">
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
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent-fill bg-surface text-sm font-semibold text-accent hover:bg-felt-50"
              >
                Next
              </button>
            </div>
          ) : null}

          {pendingSpareLeave && (
            <div className="flex items-center gap-2 rounded-lg border border-accent-fill bg-felt-50 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowSpareLineDialog(true)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-accent"
              >
                + Save spare line for {formatLeavePins(pendingSpareLeave.pins)}
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
              : (l) => {
                  // A hand edit owns the line from here: it must survive a
                  // later ball change untouched.
                  lineAutoFilled.current = false;
                  setIntendedLine(l);
                }
          }
          actual={isEditing && recordedShot ? recordedShot.actual : actualLine}
          onActualChange={isEditing ? (l) => handleEditMeta({ actual: l }) : setActualLine}
          notes={isEditing && recordedShot ? recordedShot.notes ?? "" : shotNotes}
          spareLeave={shownLeave}
          onEditAttempt={requestEdit}
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

      {errorMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-red-600">{errorMessage}</p>
      )}

      <ConfirmDialog
        open={showEditPrompt}
        title="Edit this completed game?"
        message="This game is finished. Changing a recorded shot can't be undone."
        confirmLabel="Edit"
        onConfirm={() => {
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
          initialNotes={pendingSpareLeave.notes}
          onSaved={() => {
            setShowSpareLineDialog(false);
            setPendingSpareLeave(null);
            getSpareLinesAll().then(setSpareLines).catch(() => {});
          }}
          onCancel={() => setShowSpareLineDialog(false)}
        />
      )}
    </section>
  );
}
