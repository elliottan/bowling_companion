import {
  BarChart3,
  History,
  Home,
  PlayCircle,
  Settings,
  type LucideIcon
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState
} from "react";
import { DashboardView } from "./views/DashboardView";
import { NoSessionView } from "./views/NoSessionView";
import { HandednessPrompt } from "./components/HandednessPrompt";
import { ActiveSessionView } from "./views/ActiveSessionView";
import { HistoryView } from "./views/HistoryView";
import { rememberScroll, restoreScroll } from "./lib/viewMemory";
import { SettingsView } from "./views/SettingsView";
import { StatsView } from "./views/StatsView";
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
import type { Handedness, LineSpec } from "./types/bowling";
import { LaneVisualizerLazy } from "./components/LaneVisualizerLazy";
import { UpdateToast } from "./components/UpdateToast";
import { shouldResetScroll } from "./lib/viewportScroll";
import { navReducer, type AppView, type Overlay } from "./lib/appNavigation";
import { initialNavFromHash } from "./lib/appRoute";
import { useHistoryRoute } from "./lib/useHistoryRoute";

// Pushed screens, loaded when pushed: the catalog carries the whole ball list
// UI and the arsenal its editor, and neither is on the path to scoring a game.
const ArsenalView = lazy(() => import("./views/ArsenalView").then((m) => ({ default: m.ArsenalView })));
const CatalogView = lazy(() => import("./views/CatalogView").then((m) => ({ default: m.CatalogView })));
const LaneNotesView = lazy(() => import("./views/LaneNotesView").then((m) => ({ default: m.LaneNotesView })));
const OilPatternsView = lazy(() => import("./views/OilPatternsView").then((m) => ({ default: m.OilPatternsView })));
const BackupRestoreView = lazy(() =>
  import("./views/BackupRestoreView").then((m) => ({ default: m.BackupRestoreView }))
);
const SpareLinesView = lazy(() =>
  import("./views/SpareLinesView").then((m) => ({ default: m.SpareLinesView }))
);
const OpenFramesView = lazy(() =>
  import("./views/OpenFramesView").then((m) => ({ default: m.OpenFramesView }))
);
const GameTrendView = lazy(() =>
  import("./views/GameTrendView").then((m) => ({ default: m.GameTrendView }))
);
const GamePlanView = lazy(() =>
  import("./views/GamePlanView").then((m) => ({ default: m.GamePlanView }))
);

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
  { view: "settings", label: "Settings", icon: Settings }
];

const MOBILE_NAV_ITEMS = NAV_ITEMS;

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
  const {
    view,
    activeSessionId,
    openSessionStats,
    openSessionGameId,
    openSessionBallId,
    settingsSection,
    overlays
  } = nav;
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

  // Each tab is remounted on switch (the `key` on <main> below), so its scroll
  // offset is parked on the way out and put back before the next paint.
  const mainRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!mainRef.current) return;
    return restoreScroll(mainRef.current, `view:${view}`);
  }, [view]);

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
  // result is surfaced in Settings → Backup & restore, not here.
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
  // The dashboard's shortcuts push over the tab the user is on (see `Overlay`),
  // so the only jump straight to a Settings section is Settings' own menu.
  const goToBackup = () => pushOverlay("backup");

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

  /** Straight to one game of a session, from a stats drill-down. The ball goes
   *  too: the session sheet opens on that game with its shots lit up. */
  function openSessionGame(sessionId: number, gameId: number, ballId?: number) {
    dispatch({ type: "openSession", sessionId, gameId, ballId });
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
                  onClick={() => goTo(item.view)}
              />
            ))}
          </nav>
        </div>
      </header>

      {/* Keyed on the view so each tab's content re-enters, travelling from the
          side the tapped tab sits on. */}
      <main
        key={view}
        ref={mainRef}
        onScroll={(e) => rememberScroll(`view:${view}`, e.currentTarget.scrollTop)}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${tabDirection >= 0 ? "animate-tab-right" : "animate-tab-left"}`}
      >
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
            onOpenLaneNotes={() => pushOverlay("lanes")}
            onOpenOilPatterns={() => pushOverlay("oil-patterns")}
            onOpenGamePlan={() => pushOverlay("game-plan")}
            onSessionDeleted={handleSessionDeleted}
            onOpenBackup={goToBackup}
          />
        )}
        {view === "active" && !activeSessionId && (
          <NoSessionView
            onStartSession={handleStartSession}
            isSubmitting={isStartingSession}
            error={startError}
          />
        )}
        {view === "active" && activeSessionId && (
          <ActiveSessionView
            sessionId={activeSessionId}
            openStatsOnMount={openSessionStats}
            initialGameId={openSessionGameId ?? undefined}
            initialBallId={openSessionBallId ?? undefined}
            onGameOpened={() => dispatch({ type: "sessionGameOpened" })}
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
            onViewStats={() => goTo("stats")}
          />
        )}
        {view === "stats" && (
          <StatsView
            onOpenSession={openSession}
            onOpenSessionGame={openSessionGame}
            onViewSessions={() => goTo("history")}
            onOpenFrames={() => pushOverlay("open-frames")}
            onOpenGameTrend={() => pushOverlay("game-trend")}
            onOpenSpareLines={() => pushOverlay("spares")}
          />
        )}
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
            onClick={() => goTo(item.view)}
          />
        ))}
      </nav>

      {/* Overlay stack. Rendering in order is what layers them: equal z-index,
          so the later sibling paints on top, and popping reveals the one below
          rather than dropping back to the tab. */}
      <Suspense fallback={null}>
      {overlays.map((overlay, i) => {
        switch (overlay) {
          case "arsenal":
            return (
              <ArsenalView
                key={`arsenal-${i}`}
                onBack={popOverlay}
                onOpenCatalog={() => pushOverlay("catalog")}
              />
            );
          case "catalog":
            return (
              <CatalogView
                key={`catalog-${i}`}
                onBack={popOverlay}
                selectedBallId={nav.catalogBallId}
                onSelectBall={(ballId) => dispatch({ type: "openCatalogBall", ballId })}
              />
            );
          // Settings sections, pushed over the tab that opened them.
          case "lanes":
            return <LaneNotesView key={`lanes-${i}`} onBack={popOverlay} mode="overlay" />;
          case "oil-patterns":
            return <OilPatternsView key={`oil-patterns-${i}`} onBack={popOverlay} mode="overlay" />;
          case "backup":
            return <BackupRestoreView key={`backup-${i}`} onBack={popOverlay} mode="overlay" />;
          case "spares":
            return <SpareLinesView key={`spares-${i}`} onBack={popOverlay} />;
          // Stats drill-downs. They read the shared session filter themselves,
          // so there is nothing to thread through here.
          case "open-frames":
            return <OpenFramesView key={`open-frames-${i}`} onBack={popOverlay} />;
          case "game-trend":
            return <GameTrendView key={`game-trend-${i}`} onBack={popOverlay} />;
          case "game-plan":
            return (
              <GamePlanView
                key={`game-plan-${i}`}
                onBack={popOverlay}
                // One dispatch, not a pop and a switch: the pop lands through
                // popstate a tick later and would overwrite the switch.
                onOpenStats={() => dispatch({ type: "crossToTab", view: "stats" })}
                onOpenSession={(sessionId) => openSession(sessionId)}
              />
            );
        }
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
        <HandednessPrompt onSelect={chooseHandedness} />
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
