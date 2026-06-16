import {
  BarChart3,
  History,
  Home,
  PlayCircle,
  Settings,
  Target,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardView } from "./views/DashboardView";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { HistoryView } from "./views/HistoryView";
import { StatsView } from "./views/StatsView";
import { SettingsView, type SettingsSection } from "./views/SettingsView";
import { SpareLinesView } from "./views/SpareLinesView";
import {
  addGameToSession,
  createSession
} from "./services/bowlingRepository";
import type { NewSessionFormValues } from "./components/SessionForm";

type AppView = "dashboard" | "active" | "history" | "stats" | "spares" | "settings";

type NavItem = {
  view: AppView;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { view: "dashboard", label: "Home", icon: Home },
  { view: "active", label: "Active", icon: PlayCircle },
  { view: "history", label: "History", icon: History },
  { view: "stats", label: "Stats", icon: BarChart3 },
  { view: "spares", label: "Spares", icon: Target },
  { view: "settings", label: "Settings", icon: Settings }
];

const MOBILE_NAV_ITEMS = NAV_ITEMS;

function App() {
  const [view, setView] = useState<AppView>("dashboard");
  // The view to return to when leaving the active session (set on entry).
  const [previousView, setPreviousView] = useState<AppView>("dashboard");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [startError, setStartError] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("menu");

  // Navigate, remembering where we came from when entering the active view.
  function goTo(target: AppView) {
    if (target === "active" && view !== "active") setPreviousView(view);
    if (target === "settings") setSettingsSection("menu");
    setView(target);
  }

  // Keyboard overlays the nav (viewport interactive-widget=overlays-content);
  // scroll a focused field into view so it isn't hidden behind the keyboard.
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      if (t && t.matches("input, textarea, select")) {
        setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // Deep-link into Settings → Arsenal (from the scorer's ball selector).
  function openArsenal() {
    if (view !== "active") setPreviousView(view);
    setSettingsSection("arsenal");
    setView("settings");
  }

  async function handleStartSession(values: NewSessionFormValues) {
    setIsStartingSession(true);
    setStartError("");

    try {
      const sessionId = await createSession({
        alley_name: values.alley_name,
        description: values.description,
        date: values.date,
        oil_pattern: values.oil_pattern,
        oil_pattern_id: values.oil_pattern_id,
        general_notes: values.general_notes
      });

      await addGameToSession(sessionId, {
        game_number: 1,
        lanes: values.lanes,
        start_lane: values.start_lane,
        lane_number: values.lanes[0]
      });

      setActiveSessionId(sessionId);
      goTo("active");
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
    goTo("active");
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-lane-50 text-slate-950">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-3 py-3 sm:px-6">
          {view === "dashboard" ? (
            <button
              type="button"
              onClick={() => goTo("dashboard")}
              className="text-base font-bold tracking-tight text-slate-950 sm:text-lg"
            >
              Bowling Companion
            </button>
          ) : (
            <span />
          )}
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.view}
                item={item}
                active={view === item.view}
                disabled={item.view === "active" && !activeSessionId}
                onClick={() => goTo(item.view)}
              />
            ))}
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
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
            onBack={() => setView(previousView)}
            onSessionDeleted={() => {
              setActiveSessionId(null);
              setView(previousView);
            }}
            onOpenArsenal={openArsenal}
          />
        )}
        {view === "history" && (
          <HistoryView
            onOpenSession={openSession}
            activeSessionId={activeSessionId}
            onSessionDeleted={(id) => {
              if (id === activeSessionId) setActiveSessionId(null);
            }}
          />
        )}
        {view === "stats" && <StatsView />}
        {view === "spares" && <SpareLinesView />}
        {view === "settings" && (
          <SettingsView section={settingsSection} onSectionChange={setSettingsSection} />
        )}
      </main>

      <nav className="grid shrink-0 grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {MOBILE_NAV_ITEMS.map((item) => (
          <TabBarButton
            key={item.view}
            item={item}
            active={view === item.view}
            disabled={item.view === "active" && !activeSessionId}
            onClick={() => goTo(item.view)}
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
      className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "font-bold text-felt-700" : "font-medium text-slate-600"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-felt-700"
        />
      )}
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </button>
  );
}

export default App;
