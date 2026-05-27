import { Archive, History, Home, PlayCircle } from "lucide-react";
import { useState } from "react";
import { DashboardView } from "./views/DashboardView";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { HistoryView } from "./views/HistoryView";
import { BackupRestoreView } from "./views/BackupRestoreView";
import {
  addGameToSession,
  createSession
} from "./services/bowlingRepository";
import type { NewSessionFormValues } from "./components/SessionForm";

type AppView = "dashboard" | "active" | "history" | "backup";

function App() {
  const [view, setView] = useState<AppView>("dashboard");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [startError, setStartError] = useState("");

  async function handleStartSession(values: NewSessionFormValues) {
    setIsStartingSession(true);
    setStartError("");

    try {
      const sessionId = await createSession({
        alley_name: values.alley_name,
        date: values.date,
        oil_pattern: values.oil_pattern,
        general_notes: values.general_notes
      });

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
    <main className="min-h-screen overflow-x-hidden bg-lane-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className="text-left text-xl font-bold leading-tight text-slate-950"
          >
            Bowling Companion
          </button>

          <nav className="grid w-full grid-cols-4 gap-2 sm:w-auto sm:flex">
            <button
              type="button"
              onClick={() => setView("dashboard")}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm ${
                view === "dashboard"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <Home aria-hidden="true" size={17} />
              <span className="truncate">Dash</span>
            </button>
            <button
              type="button"
              onClick={() => activeSessionId && setView("active")}
              disabled={!activeSessionId}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm ${
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
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm ${
                view === "history"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <History aria-hidden="true" size={17} />
              History
            </button>
            <button
              type="button"
              onClick={() => setView("backup")}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm ${
                view === "backup"
                  ? "bg-felt-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              <Archive aria-hidden="true" size={17} />
              Backup
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

      {view === "backup" ? <BackupRestoreView /> : null}
    </main>
  );
}

export default App;
