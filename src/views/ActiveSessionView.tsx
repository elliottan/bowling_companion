import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import {
  addNextGameToSession,
  getSessionDetails,
  saveFrame,
  updateGameNotes
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
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const activeGame = useMemo(
    () => sessionDetails?.games.find((g) => g.id === activeGameId) ?? null,
    [activeGameId, sessionDetails]
  );

  // Seed the note field whenever the active game changes.
  useEffect(() => {
    setNote(activeGame?.notes ?? "");
  }, [activeGame?.id, activeGame?.notes]);

  async function saveNote() {
    if (!activeGame?.id) return;
    if ((activeGame.notes ?? "") === note.trim()) return;
    await updateGameNotes(activeGame.id, note);
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
    setLaneNumber(selected?.lane_number ?? "");
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
        setLaneNumber(latest?.lane_number ?? "");
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
      const nextGameId = await addNextGameToSession(sessionId, laneNumber || undefined);
      await refreshSession(nextGameId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add game.");
    } finally {
      setIsAddingGame(false);
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
          onClick={onBackToDashboard}
          className="mt-3 inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Back
        </button>
      </section>
    );
  }

  const canAddGame = activeGame.final_score !== undefined && !isAddingGame;

  return (
    <div>
      <section className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToDashboard}
            aria-label="Back to dashboard"
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
              {activeGame.lane_number ? ` · Lane ${activeGame.lane_number}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddGame}
            disabled={!canAddGame}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-felt-700 px-3 text-sm font-semibold text-white hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Add game
          </button>
        </div>

        {sessionDetails.games.length > 1 && (
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {sessionDetails.games.map((g) => (
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
          </div>
        )}

        <details className="group mt-3" open={Boolean(activeGame.notes)}>
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-slate-500 marker:hidden">
            Note for this game
            <span className="ml-1 text-slate-400 group-open:hidden">+</span>
          </summary>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Ball, lane move, what worked..."
            className="mt-2 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
          />
        </details>

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
        onFrameComplete={handleFrameComplete}
      />
    </div>
  );
}
