import { ChevronLeft, ListChecks, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SessionSheet } from "../components/SessionSheet";
import {
  addNextGameToSession,
  deleteGame,
  getSessionDetails,
  saveFrame,
  updateGameLanes
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
  const [showSheet, setShowSheet] = useState(false);

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

  // Collapse the editor only when switching games, not on every lane save.
  useEffect(() => {
    setShowLaneEditor(false);
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
    const lanes = [a, b].filter(Boolean);
    const start_lane = lanes.length === 2 ? (side === "A" ? a : b) : lanes[0];
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

  const laneLabel = (activeGame.lanes ?? (activeGame.lane_number ? [activeGame.lane_number] : [])).join(" / ");
  const games = sessionDetails.games;
  const latestGame = games[games.length - 1];
  const latestComplete = latestGame?.final_score !== undefined;
  const isLastGameActive = activeGame.id === latestGame?.id;
  // The big "Next Game" CTA only when the active (last) game is fully complete.
  const showNextGameCta = isLastGameActive && latestComplete;
  // The +/menu can add a game at any time.
  const canAddGame = !isAddingGame;

  return (
    <div>
      <section className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {sessionDetails.session.alley_name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {sessionDetails.session.date} · Game {activeGame.game_number}
            </p>
            <button
              type="button"
              onClick={() => setShowLaneEditor((v) => !v)}
              className="mt-0.5 inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
            >
              {laneLabel ? `Lane ${laneLabel}` : "+ Add lane"}
            </button>
          </div>
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
                    onClick={() => { setShowMenu(false); setShowSheet(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ListChecks size={16} aria-hidden="true" />
                    Session sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); setConfirmDeleteGame(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Delete game
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Inline lane editor */}
        {showLaneEditor && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={laneA}
                onChange={(e) => setLaneA(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="First lane"
                placeholder="12"
                className="h-8 w-14 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700"
              />
              <span className="text-slate-400">/</span>
              <input
                value={laneB}
                onChange={(e) => setLaneB(e.target.value.replace(/\D/g, ""))}
                onBlur={() => saveLanes()}
                inputMode="numeric"
                aria-label="Second lane"
                placeholder="13"
                className="h-8 w-14 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700"
              />
              {laneA.trim() && laneB.trim() && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Frame 1 on:</span>
                  {(["A", "B"] as const).map((side) => {
                    const lane = side === "A" ? laneA.trim() : laneB.trim();
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => { setStartSide(side); void saveLanes(side); }}
                        className={`h-7 rounded-md border px-2 text-xs font-semibold ${
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
              )}
            </div>
            {laneError && <p className="text-xs text-red-600">{laneError}</p>}
          </div>
        )}

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
              Game {g.game_number}
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
        mode="session"
        game={activeGame}
        onFrameComplete={handleFrameComplete}
        onNextGame={showNextGameCta ? handleAddGame : undefined}
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
        <SessionSheet
          summary={sessionDetails}
          currentGameId={activeGame.id}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  );
}
