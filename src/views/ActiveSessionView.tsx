import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveGameScorer } from "../components/ActiveGameScorer";
import {
  addNextGameToSession,
  getSessionDetails,
  saveFrame,
  updateGameLanes,
  updateGameNotes
} from "../services/bowlingRepository";
import type { Frame, Game, SessionSummary } from "../types/bowling";

interface ActiveSessionViewProps {
  sessionId: number;
  onBackToDashboard: () => void;
}

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

export function ActiveSessionView({
  sessionId,
  onBackToDashboard
}: ActiveSessionViewProps) {
  const [sessionDetails, setSessionDetails] = useState<SessionSummary | null>(null);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  // Per-game lane editor
  const [laneA, setLaneA] = useState("");
  const [laneB, setLaneB] = useState("");
  const [startSide, setStartSide] = useState<"A" | "B">("A");
  const [laneError, setLaneError] = useState("");

  const activeGame = useMemo(
    () => sessionDetails?.games.find((g) => g.id === activeGameId) ?? null,
    [activeGameId, sessionDetails]
  );

  useEffect(() => {
    setNote(activeGame?.notes ?? "");
    const lanes = activeGame?.lanes ?? (activeGame?.lane_number ? [activeGame.lane_number] : []);
    setLaneA(lanes[0] ?? "");
    setLaneB(lanes[1] ?? "");
    setStartSide(activeGame?.start_lane && activeGame.start_lane === lanes[1] ? "B" : "A");
    setLaneError("");
  }, [activeGame?.id, activeGame?.notes, activeGame?.lanes, activeGame?.lane_number, activeGame?.start_lane]);

  async function saveNote() {
    if (!activeGame?.id) return;
    if ((activeGame.notes ?? "") === note.trim()) return;
    await updateGameNotes(activeGame.id, note);
    await refreshSession(activeGame.id);
  }

  async function saveLanes() {
    if (!activeGame?.id) return;
    const a = laneA.trim();
    const b = laneB.trim();
    if ((a && !isPositiveInt(a)) || (b && !isPositiveInt(b)) || (!a && b)) {
      setLaneError("Lanes must be whole numbers (enter the first lane before the second).");
      return;
    }
    setLaneError("");
    const lanes = [a, b].filter(Boolean);
    const start_lane = lanes.length === 2 ? (startSide === "A" ? a : b) : lanes[0];
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
      // Carries the lane pair and flips the start lane (cross-lane) automatically.
      const nextGameId = await addNextGameToSession(sessionId);
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
  const laneLabel = (activeGame.lanes ?? (activeGame.lane_number ? [activeGame.lane_number] : [])).join(" / ");

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
              {laneLabel ? ` · Lane ${laneLabel}` : ""}
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

        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-slate-500 marker:hidden">
            Lane(s) for this game
            <span className="ml-1 text-slate-400 group-open:hidden">+</span>
          </summary>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={laneA}
                onChange={(e) => setLaneA(e.target.value)}
                onBlur={saveLanes}
                inputMode="numeric"
                aria-label="First lane"
                placeholder="12"
                className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700"
              />
              <span className="text-slate-400">/</span>
              <input
                value={laneB}
                onChange={(e) => setLaneB(e.target.value)}
                onBlur={saveLanes}
                inputMode="numeric"
                aria-label="Second lane"
                placeholder="13"
                className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700"
              />
              {laneA.trim() && laneB.trim() && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">F1:</span>
                  {(["A", "B"] as const).map((side) => {
                    const lane = side === "A" ? laneA.trim() : laneB.trim();
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => { setStartSide(side); setTimeout(saveLanes, 0); }}
                        className={`h-8 rounded-md border px-2 text-xs font-semibold ${
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
            <p className="text-[11px] text-slate-400">
              Two lanes = cross-lane (frames alternate). New games auto-flip the starting lane.
            </p>
          </div>
        </details>

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
        game={activeGame}
        onFrameComplete={handleFrameComplete}
      />
    </div>
  );
}
