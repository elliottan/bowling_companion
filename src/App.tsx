import { History, Home, PlayCircle } from "lucide-react";
import { useState } from "react";
import { DashboardView } from "./views/DashboardView";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { HistoryView } from "./views/HistoryView";
import {
  addGameToSession,
  createSession
} from "./services/bowlingRepository";
import type { NewSessionFormValues } from "./components/SessionForm";

type AppView = "dashboard" | "active" | "history";

function App() {
  const [view, setView] = useState<AppView>("dashboard");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [startError, setStartError] = useState("");

  async function handleStartSession(values: NewSessionFormValues) {
    setIsStartingSession(true);
    setStartError("");

    try {
      const sessionId = Number(
        await createSession({
          alley_name: values.alley_name,
          date: values.date,
          oil_pattern: values.oil_pattern,
          general_notes: values.general_notes
        })
      );

      await addGameToSession(sessionId, {
        game_number: 1,
        lane_number: values.lane_number
      });

      setActiveSessionId(sessionId);
      setView("active");
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Unable to start session."
      );
    } finally {
      setIsStartingSession(false);
    }
  }

  function openSession(sessionId: number) {
    setActiveSessionId(sessionId);
    setView("active");
  }

  return (
    <main className="min-h-screen bg-lane-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className="text-left text-xl font-bold text-slate-950"
          >
            Bowling Companion
          </button>

          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("dashboard")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                view === "dashboard"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <Home aria-hidden="true" size={17} />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => activeSessionId && setView("active")}
              disabled={!activeSessionId}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                view === "active"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <PlayCircle aria-hidden="true" size={17} />
              Active
            </button>
            <button
              type="button"
              onClick={() => setView("history")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                view === "history"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <History aria-hidden="true" size={17} />
              History
            </button>
          </nav>
        </div>
      </header>

      {view === "dashboard" ? (
        <DashboardView
          onStartSession={handleStartSession}
          isSubmitting={isStartingSession}
          error={startError}
        />
      ) : null}

      {view === "active" && activeSessionId ? (
        <ActiveSessionView
          sessionId={activeSessionId}
          onBackToDashboard={() => setView("dashboard")}
        />
      ) : null}

      {view === "history" ? <HistoryView onOpenSession={openSession} /> : null}
    </main>
  );
}

export default App;
