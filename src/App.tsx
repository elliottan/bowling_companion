import {
  History,
  Home,
  PlayCircle,
  Settings,
  Target,
  type LucideIcon
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DashboardView } from "./views/DashboardView";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { ArsenalView } from "./views/ArsenalView";
import { HistoryView } from "./views/HistoryView";
import { SettingsView, type SettingsSection } from "./views/SettingsView";
import { SpareLinesView } from "./views/SpareLinesView";
import {
  addGameToSession,
  createSession,
  getHandedness,
  getResumableForSession,
  getResumableToday,
  setHandedness as persistHandedness,
  type ResumableGame
} from "./services/bowlingRepository";
import type { NewSessionFormValues } from "./components/SessionForm";
import { HandednessContext } from "./lib/handednessContext";
import { HandednessPicker } from "./components/HandednessPicker";
import type { Handedness } from "./types/bowling";

type AppView = "dashboard" | "active" | "history" | "spares" | "settings";

type NavItem = {
  view: AppView;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { view: "dashboard", label: "Home", icon: Home },
  { view: "active", label: "Active", icon: PlayCircle },
  { view: "history", label: "History", icon: History },
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
  const [handedness, setHandednessState] = useState<Handedness | null>(null);
  const [handednessLoaded, setHandednessLoaded] = useState(false);
  const [resumable, setResumable] = useState<ResumableGame | null>(null);
  const [arsenalOpen, setArsenalOpen] = useState(false);
  const [sheetDrag, setSheetDrag] = useState(0);
  const sheetDragStartY = useRef<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // The on-screen keyboard resizes the (standalone) webview, which would shove
  // the bottom nav up to float above the keyboard. Instead we hide the nav
  // while a text field is focused, letting the scrollable <main> take the full
  // height and reveal the field; the nav reappears on blur. Tracking focus (not
  // viewport size) avoids the resize getting "stuck" after the keyboard closes.
  useEffect(() => {
    const isTextField = (el: Element | null) =>
      !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target as Element)) setKeyboardOpen(true);
    };
    const onFocusOut = () => {
      // Defer so focus moving between fields doesn't flicker the nav.
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setKeyboardOpen(false);
      }, 50);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // On launch, if today has an unfinished game, jump straight into it.
  useEffect(() => {
    getResumableToday()
      .then((r) => {
        if (r) {
          setActiveSessionId(r.sessionId);
          setView("active");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The home "resume" widget reflects (and jumps to) the currently active
  // session — whichever session is loaded in the Active tab. Falls back to
  // today's unfinished game when nothing is active. Refreshes on view change so
  // the game number stays current.
  useEffect(() => {
    if (activeSessionId != null) {
      getResumableForSession(activeSessionId).then(setResumable).catch(() => {});
    } else {
      getResumableToday().then(setResumable).catch(() => {});
    }
  }, [activeSessionId, view]);

  useEffect(() => {
    getHandedness()
      .then(setHandednessState)
      .catch(() => {})
      .finally(() => setHandednessLoaded(true));
  }, []);

  async function chooseHandedness(value: Handedness) {
    setHandednessState(value);
    try {
      await persistHandedness(value);
    } catch {
      // best-effort; UI already reflects the choice
    }
  }

  // Navigate, remembering where we came from when entering the active view.
  function goTo(target: AppView) {
    if (target === "active" && view !== "active") setPreviousView(view);
    if (target === "settings") setSettingsSection("menu");
    setView(target);
  }

  // Keyboard overlays the nav (viewport interactive-widget=overlays-content).
  // Only nudge a focused field into view when it's actually hidden — off the top
  // or below the keyboard-shrunk visual viewport — and then by the minimum amount
  // (block: "nearest"). Scrolling already-visible fields caused a jarring jump.
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      if (t && t.matches("input, textarea, select")) {
        setTimeout(() => {
          const rect = t.getBoundingClientRect();
          const bottomLimit = window.visualViewport?.height ?? window.innerHeight;
          if (rect.top < 0 || rect.bottom > bottomLimit - 8) {
            t.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }, 250);
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // Arsenal opens as a modal overlay (from the scorer's ball selector or Settings).
  function openArsenal() {
    setArsenalOpen(true);
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
    <HandednessContext.Provider value={handedness ?? "right"}>
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-lane-50 text-slate-950">
      <header className="hidden shrink-0 border-b border-slate-200 bg-white sm:block">
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

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view === "dashboard" && (
          <DashboardView
            onStartSession={handleStartSession}
            isSubmitting={isStartingSession}
            error={startError}
            resumable={resumable}
            onResume={() => resumable && openSession(resumable.sessionId)}
            onOpenSession={openSession}
            onViewAll={() => goTo("history")}
            activeSessionId={activeSessionId}
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
          <HistoryView onOpenSession={openSession} activeSessionId={activeSessionId} />
        )}
        {view === "spares" && <SpareLinesView />}
        {view === "settings" && (
          <SettingsView
            section={settingsSection}
            onSectionChange={setSettingsSection}
            handedness={handedness ?? "right"}
            onHandednessChange={chooseHandedness}
            onOpenArsenal={openArsenal}
          />
        )}
      </main>

      <nav className={`relative grid shrink-0 grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden ${keyboardOpen ? "hidden" : ""}`}>
        {/* Single highlight that slides to the active tab. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-[3px] w-1/5 transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${Math.max(0, MOBILE_NAV_ITEMS.findIndex((i) => i.view === view)) * 100}%)` }}
        >
          <span className="mx-3 block h-full rounded-b-full bg-felt-700" />
        </span>
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

      {arsenalOpen && (
        <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true">
          {/* Backdrop – tap above sheet to dismiss */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setSheetDrag(0); setArsenalOpen(false); }}
          />
          {/* Bottom sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl bg-lane-50 shadow-xl"
            style={{
              top: "72px",
              transform: `translateY(${sheetDrag}px)`,
              transition: sheetDrag === 0 ? "transform 0.25s ease-out" : "none",
            }}
          >
            {/* Drag pill */}
            <div
              className="flex touch-none cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing"
              onPointerDown={(e) => {
                sheetDragStartY.current = e.clientY;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (sheetDragStartY.current === null) return;
                const delta = e.clientY - sheetDragStartY.current;
                if (delta > 0) setSheetDrag(delta);
              }}
              onPointerUp={() => {
                if (sheetDrag > 80) {
                  setArsenalOpen(false);
                }
                setSheetDrag(0);
                sheetDragStartY.current = null;
              }}
              onPointerCancel={() => {
                setSheetDrag(0);
                sheetDragStartY.current = null;
              }}
            >
              <div className="h-1.5 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ArsenalView />
            </div>
          </div>
        </div>
      )}

      {handednessLoaded && handedness === null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-950">Which hand do you bowl with?</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              This sets the direction of the board-adjust arrows when entering your line. You can change it later in Settings → Preferences.
            </p>
            <div className="mt-4">
              <HandednessPicker value={handedness} onSelect={chooseHandedness} />
            </div>
          </div>
        </div>
      )}
    </div>
    </HandednessContext.Provider>
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
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </button>
  );
}

export default App;
