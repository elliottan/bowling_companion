import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import {
  addNextGameToSession,
  getSessionDetails,
  saveFrame
} from "../services/bowlingRepository";
import type { Frame, Game, SessionSummary } from "../types/bowling";

interface ActiveSessionViewProps {
  sessionId: number;
  onBackToDashboard: () => void;
}

export function ActiveSessionView({
  sessionId,
  onBackToDashboard
}: ActiveSessionViewProps) {
  const [sessionDetails, setSessionDetails] = useState<SessionSummary | null>(null);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [laneNumber, setLaneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [error, setError] = useState("");

  const activeGame = useMemo(
    () => sessionDetails?.games.find((game) => game.id === activeGameId) ?? null,
    [activeGameId, sessionDetails]
  );

  async function refreshSession(nextActiveGameId?: number) {
    const details = await getSessionDetails(sessionId);

    if (!details) {
      throw new Error("Session not found.");
    }

    setSessionDetails(details);

    const selectedGame =
      details.games.find((game) => game.id === nextActiveGameId) ??
      details.games[details.games.length - 1] ??
      null;

    setActiveGameId(selectedGame?.id ?? null);
    setLaneNumber(selectedGame?.lane_number ?? "");
  }

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      setIsLoading(true);
      setError("");

      try {
        const details = await getSessionDetails(sessionId);

        if (!isMounted) {
          return;
        }

        if (!details) {
          throw new Error("Session not found.");
        }

        setSessionDetails(details);
        const latestGame = details.games[details.games.length - 1] ?? null;
        setActiveGameId(latestGame?.id ?? null);
        setLaneNumber(latestGame?.lane_number ?? "");
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load session."
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  async function handleFrameComplete(frame: Frame) {
    if (!activeGame?.id) {
      throw new Error("No active game selected.");
    }

    await saveFrame(activeGame.id, frame);
    await refreshSession(activeGame.id);
  }

  async function handleAddGame() {
    if (isAddingGame) return;
    setError("");
    setIsAddingGame(true);
    try {
      const nextGameId = await addNextGameToSession(sessionId, laneNumber);
      await refreshSession(nextGameId);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Unable to add game.");
    } finally {
      setIsAddingGame(false);
    }
  }

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-slate-600 sm:px-6 lg:px-8">
        Loading active session...
      </section>
    );
  }

  if (!sessionDetails || !activeGame) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error || "No active game was found for this session."}
        </p>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800"
        >
          Back
        </button>
      </section>
    );
  }

  const canAddGame = activeGame.final_score !== undefined && !isAddingGame;

  return (
    <div>
      <section className="mx-auto w-full max-w-6xl px-3 pt-4 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-felt-700">
                {sessionDetails.session.date}
              </p>
              <h1 className="truncate text-2xl font-bold text-slate-950">
                {sessionDetails.session.alley_name}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Game {activeGame.game_number} • Lane {activeGame.lane_number || "not set"}
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-row">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Next lane
                </span>
                <input
                  value={laneNumber}
                  onChange={(event) => setLaneNumber(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20 sm:w-28"
                />
              </label>

              <button
                type="button"
                onClick={handleAddGame}
                disabled={!canAddGame}
                className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-felt-700 px-3 text-sm font-semibold text-white hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
              >
                <Plus aria-hidden="true" size={18} />
                <span className="hidden min-[360px]:inline">Add game</span>
              </button>

              <button
                type="button"
                onClick={onBackToDashboard}
                className="col-span-2 inline-flex h-10 items-center justify-center self-end rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:col-span-1"
              >
                Dashboard
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <ActiveGameScorer
        gameKey={activeGame.id}
        initialFrames={(activeGame as Game & { frames: Frame[] }).frames}
        eyebrow="Active session"
        title={`Game ${activeGame.game_number}`}
        description="Score this game frame by frame. Completed frames are saved locally to IndexedDB."
        showNewGameButton={false}
        onFrameComplete={handleFrameComplete}
      />
    </div>
  );
}
