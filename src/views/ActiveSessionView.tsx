import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionHeaderText } from "../components/SessionHeaderText";
import { SessionLanePanel, type SessionPanelTab } from "../components/SessionLanePanel";
import { Button } from "../components/ui/Button";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
import type { NewSessionFormValues } from "../components/SessionForm";
import { calculateGameScore } from "../lib/scoring";
import { useLongPress } from "../lib/useLongPress";
import { useOverlay } from "../lib/useOverlay";
import {
  addNextGameToSession,
  deleteGame,
  getSessionDetails,
  saveFrame,
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

export function ActiveSessionView({
  sessionId,
  openStatsOnMount = false,
  onStatsOpened,
  initialGameId,
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
  const [showSheet, setShowSheet] = useState(openStatsOnMount);
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

  useEffect(() => {
    if (openStatsOnMount) onStatsOpened?.();
    // Mount-only: the flag is consumed by the initial state above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const longPress = useLongPress();
  const laneEditorRef = useOverlay<HTMLDivElement>(() => setShowLaneEditor(false), showLaneEditor);

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
      setLaneError("Lanes must be whole numbers (enter the first lane before the second).");
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
        Loading...
      </section>
    );
  }

  if (!sessionDetails || !activeGame) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <ErrorBanner>{error || "No active game was found for this session."}</ErrorBanner>
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
      <section className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-6">
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
            className="min-w-0 flex-1 rounded-md hover:bg-surface-muted"
            aria-label="Open session sheet and lane notes"
          >
            <SessionHeaderText session={sessionDetails.session} games={games} />
          </div>
          <button
            type="button"
            onClick={() => { setSheetTab("stats"); setShowSheet(true); }}
            aria-label="Open session stats"
            className="shrink-0 rounded-md text-right hover:bg-surface-muted"
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
        <div className="mt-3 flex items-center gap-2 overflow-x-auto py-1">
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
          {/* Chip-height (h-9), not the 44pt IconButton — it sits in the chip
              row and a taller box makes the row look ragged. Tap target is
              expanded vertically the same way Chip does it. */}
          <button
            type="button"
            onClick={() => void handleAddGame()}
            disabled={!canAddGame}
            aria-label="New game"
            title="New game"
            className={`relative inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md bg-ink text-surface hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50 ${TAP_TARGET_44}`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>

        {chipMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setChipMenu(null)} />
            <div
              className="fixed z-20 w-44 overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-lg"
              style={{ left: chipMenu.left, top: chipMenu.top }}
            >
              <button
                type="button"
                onClick={() => {
                  const gameId = chipMenu.gameId;
                  setChipMenu(null);
                  setConfirmDeleteGame(gameId);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete game
              </button>
            </div>
          </>
        )}

        {error && (
          <ErrorBanner className="mt-3">{error}</ErrorBanner>
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

      {showSheet && (
        <SessionLanePanel
          summary={sessionDetails}
          currentGameId={activeGame.id}
          defaultTab={sheetTab}
          // Close the sheet first: it portals to body after the edit dialog,
          // so it would otherwise paint on top of it.
          onEdit={() => { setShowSheet(false); setShowEdit(true); }}
          onSelectGame={(gameId) => {
            setActiveGameId(gameId);
            setShowSheet(false);
          }}
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

      {showLaneEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLaneEditor(false)}
        >
          <div ref={laneEditorRef} className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-ink">Game lanes</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              This game only. Lanes alternate every frame, so you can't set a lane
              per frame, and fixing a start lane here leaves every other game alone.
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
                className="h-10 w-16 rounded-lg border border-edge-strong px-2 text-sm outline-none focus:border-accent-fill"
              />
              <span aria-hidden="true" className="text-ink-secondary">/</span>
              <input
                value={laneB}
                onChange={(e) => setLaneB(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="Second lane"
                placeholder="13"
                className="h-10 w-16 rounded-lg border border-edge-strong px-2 text-sm outline-none focus:border-accent-fill"
              />
            </div>

            {laneA.trim() && laneB.trim() && (
              <div className="mt-4">
                <span className={`block ${GROUP_HEADING}`}>Starting lane (frame 1)</span>
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

            {laneError && <p className="mt-2 text-xs text-red-600">{laneError}</p>}

            <div className="mt-5 flex justify-end">
              <Button variant="primary" onClick={() => setShowLaneEditor(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
