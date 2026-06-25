import { BarChart3, ChevronLeft, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SessionFormDialog } from "../components/SessionFormDialog";
import { SessionLanePanel } from "../components/SessionLanePanel";
import { SessionStatsModal } from "../components/SessionStatsModal";
import type { NewSessionFormValues } from "../components/SessionForm";
import { calculateGameScore } from "../lib/scoring";
import {
  addNextGameToSession,
  deleteGame,
  deleteSession,
  getSessionDetails,
  saveFrame,
  updateGameLanes,
  updateSession
} from "../services/bowlingRepository";
import type { Frame, Game, SessionSummary } from "../types/bowling";

interface ActiveSessionViewProps {
  sessionId: number;
  onBack: () => void;
  /** Called when the last game is deleted and the session no longer exists. */
  onSessionDeleted: () => void;
  /** Jump to Arsenal to manage balls. */
  onOpenArsenal: () => void;
}

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

export function ActiveSessionView({
  sessionId,
  onBack,
  onSessionDeleted,
  onOpenArsenal
}: ActiveSessionViewProps) {
  const [sessionDetails, setSessionDetails] = useState<SessionSummary | null>(null);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDeleteGame, setConfirmDeleteGame] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Inline lane editor
  const [laneA, setLaneA] = useState("");
  const [laneB, setLaneB] = useState("");
  const [startSide, setStartSide] = useState<"A" | "B">("A");
  const [laneError, setLaneError] = useState("");
  const [showLaneEditor, setShowLaneEditor] = useState(false);

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

  // On switching to a game, open the lane editor immediately if its lanes are
  // not yet set; otherwise keep it collapsed (don't reopen on every lane save).
  useEffect(() => {
    const lanes = activeGame?.lanes ?? (activeGame?.lane_number ? [activeGame.lane_number] : []);
    setShowLaneEditor(lanes.filter((l) => l && l.trim()).length === 0);
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
        const latest = details.games[details.games.length - 1] ?? null;
        setActiveGameId(latest?.id ?? null);
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
    if (!activeGame?.id) return;
    setConfirmDeleteGame(false);
    setShowMenu(false);
    try {
      const result = await deleteGame(activeGame.id);
      if (result.sessionDeleted) {
        onSessionDeleted();
        return;
      }
      await refreshSession();
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

  async function handleDeleteSession() {
    setConfirmDeleteSession(false);
    setShowMenu(false);
    try {
      await deleteSession(sessionId);
      onSessionDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete session.");
    }
  }

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-slate-600">
        Loading...
      </section>
    );
  }

  if (!sessionDetails || !activeGame) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error || "No active game was found for this session."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Back
        </button>
      </section>
    );
  }

  const games = sessionDetails.games;
  // The +/menu can add a game at any time.
  const canAddGame = !isAddingGame;
  // Series total = sum of every game's score (final, or running if unfinished).
  const seriesTotal = games.reduce(
    (sum, g) => sum + (g.final_score ?? calculateGameScore((g as Game & { frames: Frame[] }).frames).total),
    0
  );

  return (
    <div>
      <section className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSheet(true)}
            className="min-w-0 flex-1 rounded-md text-left hover:bg-slate-50"
            aria-label="Open session sheet and lane notes"
          >
            <p className="truncate text-sm font-semibold text-slate-900">
              {sessionDetails.session.alley_name}
            </p>
            {sessionDetails.session.description && (
              <p className="truncate text-xs font-medium text-slate-600">
                {sessionDetails.session.description}
              </p>
            )}
            <p className="truncate text-xs text-slate-500">
              {sessionDetails.session.date} · {games.length} {games.length === 1 ? "game" : "games"}
            </p>
          </button>
          <p className="shrink-0 text-2xl font-extrabold leading-none text-felt-700" aria-label="Series total">
            {seriesTotal}
          </p>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              aria-label="Game options"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <MoreVertical size={18} aria-hidden="true" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); void handleAddGame(); }}
                    disabled={!canAddGame}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={16} aria-hidden="true" />
                    New game
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); setShowStats(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <BarChart3 size={16} aria-hidden="true" />
                    Session stats
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); setShowEdit(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Edit session
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); setConfirmDeleteGame(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Delete game
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); setConfirmDeleteSession(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Delete session
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => g.id && setActiveGameId(g.id)}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
                g.id === activeGameId
                  ? "border-felt-700 bg-felt-700 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              G{g.game_number}
              {g.final_score !== undefined && (
                <span className="opacity-80">· {g.final_score}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleAddGame()}
            disabled={!canAddGame}
            aria-label="New game"
            title="New game"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
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
        onFrameComplete={handleFrameComplete}
        onEditLanes={() => setShowLaneEditor(true)}
        onOpenArsenal={onOpenArsenal}
      />

      <ConfirmDialog
        open={confirmDeleteGame}
        title="Delete this game?"
        message={`Game ${activeGame.game_number} and its frames will be permanently deleted.`}
        onConfirm={handleDeleteGame}
        onCancel={() => setConfirmDeleteGame(false)}
      />

      {showSheet && (
        <SessionLanePanel
          summary={sessionDetails}
          currentGameId={activeGame.id}
          defaultTab="sheet"
          onClose={() => setShowSheet(false)}
        />
      )}

      {showStats && (
        <SessionStatsModal summary={sessionDetails} onClose={() => setShowStats(false)} />
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

      <ConfirmDialog
        open={confirmDeleteSession}
        title="Delete this session?"
        message={`"${sessionDetails.session.alley_name}" and all its games will be permanently deleted.`}
        onConfirm={handleDeleteSession}
        onCancel={() => setConfirmDeleteSession(false)}
      />

      {showLaneEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLaneEditor(false)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-950">Game lanes</h2>
            <p className="mt-1 text-xs text-slate-500">
              Applies to the whole game. Lanes alternate every frame — you can't set a lane per frame.
            </p>

            <span className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Lane pair</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={laneA}
                onChange={(e) => setLaneA(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="First lane"
                placeholder="12"
                className="h-10 w-16 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700"
              />
              <span className="text-slate-400">/</span>
              <input
                value={laneB}
                onChange={(e) => setLaneB(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="Second lane"
                placeholder="13"
                className="h-10 w-16 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700"
              />
            </div>

            {laneA.trim() && laneB.trim() && (
              <div className="mt-4">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Starting lane (frame 1)</span>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {(["A", "B"] as const).map((side) => {
                    const lane = side === "A" ? laneA.trim() : laneB.trim();
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => { setStartSide(side); void saveLanes(side); }}
                        className={`h-9 rounded-md border px-3 text-sm font-semibold ${
                          startSide === side
                            ? "border-felt-700 bg-felt-700 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {lane}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {laneError && <p className="mt-2 text-xs text-red-600">{laneError}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLaneEditor(false)}
                className="inline-flex h-10 items-center rounded-lg bg-felt-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
