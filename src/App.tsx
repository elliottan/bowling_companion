import { Archive, History, Home, PlayCircle, type LucideIcon } from "lucide-react";
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

type NavItem = {
  view: AppView;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { view: "dashboard", label: "Home", icon: Home },
  { view: "active", label: "Active", icon: PlayCircle },
  { view: "history", label: "History", icon: History },
  { view: "backup", label: "Backup", icon: Archive }
];

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
    <div className="flex min-h-screen flex-col bg-lane-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-3 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className="text-base font-bold tracking-tight text-slate-950 sm:text-lg"
          >
            Bowling Companion
          </button>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.view}
                item={item}
                active={view === item.view}
                disabled={item.view === "active" && !activeSessionId}
                onClick={() => setView(item.view)}
              />
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-20 sm:pb-0">
        {view === "dashboard" && (
          <DashboardView
            onStartSession={handleStartSession}
            isSubmitting={isStartingSession}
            error={startError}
          />
        )}
        {view === "active" && activeSessionId && (
          <ActiveSessionView
            sessionId={activeSessionId}
            onBackToDashboard={() => setView("dashboard")}
          />
        )}
        {view === "history" && <HistoryView onOpenSession={openSession} />}
        {view === "backup" && <BackupRestoreView />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-white sm:hidden">
        {NAV_ITEMS.map((item) => (
          <TabBarButton
            key={item.view}
            item={item}
            active={view === item.view}
            disabled={item.view === "active" && !activeSessionId}
            onClick={() => setView(item.view)}
          />
        ))}
      </nav>
    </div>
  );
}

interface NavItemProps {
  item: NavItem;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function NavLink({ item, active, disabled, onClick }: NavItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-felt-700 text-white"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon size={16} aria-hidden="true" />
      {item.label}
    </button>
  );
}

function TabBarButton({ item, active, disabled, onClick }: NavItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "text-felt-700" : "text-slate-600"
      }`}
    >
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </button>
  );
}

export default App;
