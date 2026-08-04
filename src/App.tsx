import {
  History,
  Home,
  PlayCircle,
  Settings,
  Target,
  type LucideIcon
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { DashboardView } from "./views/DashboardView";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { HistoryView } from "./views/HistoryView";
import { SettingsView, type SettingsSection } from "./views/SettingsView";
import { SpareLinesView } from "./views/SpareLinesView";
import {
  addGameToSession,
  createSession,
  getDriftModel,
  getHandedness,
  getResumableForSession,
  getResumableToday,
  setDriftModel as persistDriftModel,
  setHandedness as persistHandedness,
  type ResumableGame
} from "./services/bowlingRepository";
import type { NewSessionFormValues } from "./components/SessionForm";
import { HandednessContext } from "./lib/handednessContext";
import { DriftModelContext } from "./lib/driftModelContext";
import { DEFAULT_DRIFT_MODEL, type DriftModel } from "./lib/driftModel";
import { HandednessPicker } from "./components/HandednessPicker";
import type { Handedness, LineSpec } from "./types/bowling";
import { LaneVisualizerLazy } from "./components/LaneVisualizerLazy";
import { UpdateToast } from "./components/UpdateToast";
import { shouldResetScroll } from "./lib/viewportScroll";
import {
  navReducer,
  underLabel,
  type AppView,
  type Overlay
} from "./lib/appNavigation";
import { initialNavFromHash } from "./lib/appRoute";
import { useHistoryRoute } from "./lib/useHistoryRoute";

// Pushed screens, loaded when pushed: the catalog carries the whole ball list
// UI and the arsenal its editor, and neither is on the path to scoring a game.
const ArsenalView = lazy(() => import("./views/ArsenalView").then((m) => ({ default: m.ArsenalView })));
const CatalogView = lazy(() => import("./views/CatalogView").then((m) => ({ default: m.CatalogView })));

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

// A pushed screen names the screen it came from, the way a nav stack does.
const TAB_LABEL: Record<AppView, string> = {
  dashboard: "Home",
  active: "Session",
  history: "History",
  spares: "Spares",
  settings: "Settings"
};

const OVERLAY_LABEL: Record<Overlay, string> = {
  arsenal: "Arsenal",
  catalog: "Catalog"
};

// Read once, before the router normalises the hash: was the app opened at a
// particular screen, or just opened?
const launchedWithRoute = (() => {
  const hash = window.location.hash;
  return hash !== "" && hash !== "#" && hash !== "#/" && hash !== "#/home";
})();

function App() {
  // Every "where am I" question (tab, session, Settings section, overlay
  // stack) is answered by one reducer, so the rules between them are readable
  // and testable in `lib/appNavigation.ts` rather than spread across handlers.
  const [nav, dispatch] = useReducer(navReducer, window.location.hash, initialNavFromHash);
  const { view, activeSessionId, openSessionStats, settingsSection, overlays } = nav;
  // Back is the browser's: see the note in useHistoryRoute for why every path
  // routes through it rather than dispatching a pop directly.
  const goBack = useHistoryRoute(nav, dispatch);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [startError, setStartError] = useState("");
  const [handedness, setHandednessState] = useState<Handedness | null>(null);
  const [handednessLoaded, setHandednessLoaded] = useState(false);
  const [driftModel, setDriftModelState] = useState<DriftModel>(DEFAULT_DRIFT_MODEL);
  const [resumable, setResumable] = useState<ResumableGame | null>(null);
  // A realistic strike line; auto-hooks to the pocket (ADR-024), no seeded breakpoint.
  const [sandboxLine, setSandboxLine] = useState<LineSpec | undefined>({
    laydown: 20, target: 15, breakpoint: 8,
  });
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Pushed screens (PushScreen owns each one's Escape / focus trap / drag-back);
  // these only maintain the stack.
  const pushOverlay = useCallback((overlay: Overlay) => dispatch({ type: "pushOverlay", overlay }), []);
  const popOverlay = useCallback(() => goBack({ type: "popOverlay" }), [goBack]);

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

  // Rotation recovery lives entirely in CSS: the shell is `fixed inset-0`, so
  // the browser resolves its box against the live viewport at paint time. No
  // measured pixel height, no `dvh`, nothing for iOS to hand back stale — which
  // is what five earlier attempts all foundered on. See `docs/VIEWPORT-BUG.md`
  // before reintroducing any JS viewport measurement here.
  //
  // That fixed the painting but not the *tapping*: after a rotation round-trip
  // iOS left the document scrolled (measured: 62px, ≈ the safe-area top inset).
  // The fixed shell keeps painting against the visual viewport while taps
  // resolve in layout space, so every touch target sat displaced by exactly
  // that offset until relaunch. Since this app never legitimately scrolls the
  // document, any non-zero offset is spurious — clamp it back to zero.
  useEffect(() => {
    const isTextField = (el: Element | null) =>
      !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
    const reset = () => {
      const offset = window.scrollY || document.scrollingElement?.scrollTop || 0;
      if (!shouldResetScroll(offset, isTextField(document.activeElement))) return;
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    const onOrientation = () => {
      // Twice: once for the flip, once after the rotation animation settles.
      setTimeout(reset, 50);
      setTimeout(reset, 500);
    };
    // Listening to scroll as well makes this self-healing rather than
    // rotation-specific — whatever knocks the document off zero, it comes back.
    window.addEventListener("orientationchange", onOrientation);
    window.addEventListener("scroll", reset, { passive: true });
    window.visualViewport?.addEventListener("scroll", reset);
    window.addEventListener("pageshow", reset);
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("scroll", reset);
      window.visualViewport?.removeEventListener("scroll", reset);
      window.removeEventListener("pageshow", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  // Best-effort: ask the browser to make our storage persistent so it's
  // less likely to be evicted (Safari especially). Fire-and-forget; the
  // result is surfaced in Settings → Backup & Restore, not here.
  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage
        .persisted()
        .then((already) => already || navigator.storage.persist())
        .catch(() => {});
    }
  }, []);

  // On launch, if today has an unfinished game, jump straight into it. Not
  // when the URL already named a screen: a reload or a shared link asked for
  // somewhere specific, and that beats the convenience jump.
  useEffect(() => {
    if (launchedWithRoute) return;
    getResumableToday()
      .then((r) => {
        if (r) dispatch({ type: "resumeAvailable", sessionId: r.sessionId });
      })
      .catch(() => {});
  }, []);

  // The home "resume" widget reflects (and jumps to) the currently active
  // session — whichever session is loaded in the Active tab. Falls back to
  // today's unfinished game when nothing is active. Refreshes on view change so
  // the game number stays current.
  const refreshResumable = useCallback(() => {
    if (activeSessionId != null) {
      getResumableForSession(activeSessionId)
        .then((r) => (r ? r : getResumableToday()))
        .then(setResumable)
        .catch(() => {});
    } else {
      getResumableToday().then(setResumable).catch(() => {});
    }
  }, [activeSessionId]);

  useEffect(() => {
    refreshResumable();
  }, [refreshResumable, view]);

  // A session deleted from a history row may be the active one — drop the
  // stale active state so the Active tab and resume pill don't point at it.
  function handleSessionDeleted(sessionId: number) {
    // Clearing the active session refires refreshResumable via the effect;
    // deleting any other one leaves navigation alone, so refresh by hand.
    if (sessionId === activeSessionId) dispatch({ type: "sessionDeleted", sessionId });
    else refreshResumable();
  }

  useEffect(() => {
    getHandedness()
      .then(setHandednessState)
      .catch(() => {})
      .finally(() => setHandednessLoaded(true));
  }, []);

  useEffect(() => {
    getDriftModel().then(setDriftModelState).catch(() => {});
  }, []);

  async function chooseHandedness(value: Handedness) {
    setHandednessState(value);
    try {
      await persistHandedness(value);
    } catch {
      // best-effort; UI already reflects the choice
    }
  }

  function updateDriftModel(next: DriftModel) {
    setDriftModelState(next);
    void persistDriftModel(next).catch(() => {});
  }

  // Sign of the travel between tabs, so the incoming screen enters from the
  // side the user reached towards.
  const tabIndex = NAV_ITEMS.findIndex((i) => i.view === view);
  const previousTabIndex = useRef(tabIndex);
  const [tabDirection, setTabDirection] = useState(1);
  useEffect(() => {
    if (tabIndex !== previousTabIndex.current) {
      setTabDirection(tabIndex > previousTabIndex.current ? 1 : -1);
      previousTabIndex.current = tabIndex;
    }
  }, [tabIndex]);

  const goTo = (view: AppView) => dispatch({ type: "goTo", view });

  // Jump straight into a Settings section, skipping goTo's reset to the menu.
  // Used by the dashboard shortcuts and the backup nudge.
  const goToSettingsSection = (section: SettingsSection) =>
    dispatch({ type: "goToSettingsSection", section });

  const goToBackup = () => goToSettingsSection("backup");

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

  async function handleStartSession(values: NewSessionFormValues) {
    setIsStartingSession(true);
    setStartError("");

    try {
      const sessionId = await createSession({
        alley_name: values.alley_name,
        description: values.description,
        date: values.date,
        oil_pattern_id: values.oil_pattern_id,
        general_notes: values.general_notes
      });

      await addGameToSession(sessionId, {
        game_number: 1,
        lanes: values.lanes,
        start_lane: values.start_lane,
        lane_number: values.lanes[0]
      });

      dispatch({ type: "openSession", sessionId });
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Unable to start session."
      );
    } finally {
      setIsStartingSession(false);
    }
  }

  // `openStats` (a finished session) lands on the session page with the stats
  // sheet already up — there's no scoring left to do there.
  function openSession(sessionId: number, openStats = false) {
    dispatch({ type: "openSession", sessionId, openStats });
  }

  return (
    <HandednessContext.Provider value={handedness ?? "right"}>
    <DriftModelContext.Provider value={driftModel}>
    {/* `fixed inset-0` is load-bearing, not cosmetic — see the note above. */}
    <div
      id="app-shell"
      className="fixed inset-0 flex flex-col overflow-hidden bg-surface-sunken pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink"
    >
      <header className="hidden shrink-0 border-b border-edge bg-surface sm:block">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-3 py-3 sm:px-6">
          {view === "dashboard" ? (
            <button
              type="button"
              onClick={() => goTo("dashboard")}
              className="text-base font-bold tracking-tight text-ink sm:text-lg"
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

      {/* Keyed on the view so each tab's content re-enters, travelling from the
          side the tapped tab sits on. */}
      <main key={view} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${tabDirection >= 0 ? "animate-tab-right" : "animate-tab-left"}`}>
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
            onOpenCatalog={() => pushOverlay("catalog")}
            onOpenLineVisualizer={() => dispatch({ type: "openLineSandbox" })}
            onOpenArsenal={() => pushOverlay("arsenal")}
            onOpenLaneNotes={() => goToSettingsSection("lanes")}
            onOpenOilPatterns={() => goToSettingsSection("oil-patterns")}
            onSessionDeleted={handleSessionDeleted}
            onOpenBackup={goToBackup}
          />
        )}
        {view === "active" && activeSessionId && (
          <ActiveSessionView
            sessionId={activeSessionId}
            openStatsOnMount={openSessionStats}
            // One-shot: without this the sheet would re-open on every remount
            // (tab switches remount this view).
            onStatsOpened={() => dispatch({ type: "statsOpened" })}
            onBack={() => goBack({ type: "leaveSession" })}
            onSessionDeleted={() =>
              activeSessionId != null && dispatch({ type: "sessionDeleted", sessionId: activeSessionId })
            }
            onOpenArsenal={() => pushOverlay("arsenal")}
          />
        )}
        {view === "history" && (
          <HistoryView
            onOpenSession={openSession}
            activeSessionId={activeSessionId}
            onSessionDeleted={handleSessionDeleted}
          />
        )}
        {view === "spares" && <SpareLinesView />}
        {view === "settings" && (
          <SettingsView
            section={settingsSection}
            // Leaving a section is a back; entering one is a navigation.
            onSectionChange={(section) =>
              section === "menu"
                ? goBack({ type: "goToSettingsSection", section: "menu" })
                : dispatch({ type: "goToSettingsSection", section })
            }
            handedness={handedness ?? "right"}
            onHandednessChange={chooseHandedness}
            driftModel={driftModel}
            onDriftModelChange={updateDriftModel}
            onOpenArsenal={() => pushOverlay("arsenal")}
            onOpenCatalog={() => pushOverlay("catalog")}
            onOpenLineVisualizer={() => dispatch({ type: "openLineSandbox" })}
          />
        )}
      </main>

      <nav className={`relative grid shrink-0 grid-cols-5 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden ${keyboardOpen ? "hidden" : ""}`}>
        {/* Single highlight that slides to the active tab. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-[3px] w-1/5 transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${Math.max(0, MOBILE_NAV_ITEMS.findIndex((i) => i.view === view)) * 100}%)` }}
        >
          <span className="mx-3 block h-full rounded-b-full bg-accent-fill" />
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

      {/* Overlay stack. Rendering in order is what layers them: equal z-index,
          so the later sibling paints on top, and popping reveals the one below
          rather than dropping back to the tab. */}
      <Suspense fallback={null}>
      {overlays.map((overlay, i) => {
        const under = underLabel(nav, i, TAB_LABEL, OVERLAY_LABEL);
        return overlay === "arsenal" ? (
          <ArsenalView
            key={`arsenal-${i}`}
            onBack={popOverlay}
            backLabel={under}
            onOpenCatalog={() => pushOverlay("catalog")}
          />
        ) : (
          <CatalogView key={`catalog-${i}`} onBack={popOverlay} backLabel={under} />
        );
      })}
      </Suspense>

      {nav.lineSandboxOpen && (
        <LaneVisualizerLazy
          title="Line sandbox"
          line={sandboxLine}
          onChange={setSandboxLine}
          onClose={() => goBack({ type: "closeLineSandbox" })}
        />
      )}

      <UpdateToast />

      {handednessLoaded && handedness === null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl">
            <h2 className="text-base font-bold text-ink">Which hand do you bowl with?</h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              This sets the direction of the board-adjust arrows when entering your line. You can change it later in Settings → Preferences.
            </p>
            <div className="mt-4">
              <HandednessPicker value={handedness} onSelect={chooseHandedness} />
            </div>
          </div>
        </div>
      )}
    </div>
    </DriftModelContext.Provider>
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
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-accent-fill text-accent-on-fill"
          : "text-ink-strong hover:bg-surface-muted"
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
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "font-bold text-accent" : "font-medium text-ink-secondary"
      }`}
    >
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </button>
  );
}

export default App;
