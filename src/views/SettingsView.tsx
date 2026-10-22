import { TAB_TITLE, TAB_TITLE_ROW } from "../components/ui/typography";
import { Archive, ArrowUpRight, Check, ChevronRight, Compass, Download, MessageSquare, Palette, RotateCcw, ScrollText, UserRound, UserRoundCog } from "lucide-react";
import { ToolsList } from "../components/ToolsList";
import { PushScreen } from "../components/PushScreen";
import { AppearanceView } from "./AppearanceView";
import { BowlingProfileView } from "./BowlingProfileView";
import { getBowlerName, getGripStyle, getSetting } from "../services/bowlingRepository";
import { BowlerNameSheet } from "../components/BowlerNameSheet";
import type { GripStyle } from "../types/bowling";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { openFeedbackEmail } from "../lib/diagnostics";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { useProAccess, useProOwned, useProStoreContext } from "../lib/useProAccess";
import { ProBadge } from "../components/ui/ProBadge";
import { ProMark } from "../components/ui/ProMark";
import { useProOffer } from "../lib/proOffer";
import type { ProStore } from "../lib/pro";
import { BowlingBallIcon, LanePairIcon, SpareLineIcon } from "../components/icons";

// Navigating to a section is a navigation action, so the union lives with the
// rest of the navigation state.
import type { SettingsSection } from "../lib/appNavigation";
import { describeAge } from "../lib/backupNudge";
import { useLiveQuery } from "dexie-react-hooks";
import { canPromptInstall, isIOSSafari, isStandalone } from "../lib/installPrompt";
import { InstallPrompt } from "../components/InstallPrompt";
import { Suspense, lazy, useState } from "react";
export type { SettingsSection };

interface SettingsViewProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  driftModel: DriftModel;
  onDriftModelChange: (next: DriftModel) => void;
  /** Backup & restore pushes over the tab, like the arsenal and the catalog:
   *  it is also reachable from the dashboard, and both should land on the same
   *  screen. */
  onOpenBackup: () => void;
  onOpenLineVisualizer: (patternId?: number) => void;
  /** True while the line visualizer is up over Settings. */
  lineVisualizerOpen?: boolean;
  /** The same overlays Home opens, so both doors land on the same screen. */
  onOpenArsenal: () => void;
  onOpenSpareLines: () => void;
  onOpenLaneNotes: () => void;
  /** The tools Home lists, opened the same way from the Tools and reference
   *  section. The line visualizer is `onOpenLineVisualizer` above. */
  onOpenLayoutLab: () => void;
  onOpenOilPatternsScreen: () => void;
  onOpenCatalog: () => void;
  onOpenGuides: () => void;
}

/**
 * Lazy for the same reason App.tsx makes them lazy: both are also pushed as
 * overlays from the dashboard, and a static import here dragged their chunks
 * back into the main bundle, so the split App had already paid for bought
 * nothing.
 */
const LaneNotesView = lazy(() =>
  import("./LaneNotesView").then((m) => ({ default: m.LaneNotesView }))
);
const OilPatternsView = lazy(() =>
  import("./OilPatternsView").then((m) => ({ default: m.OilPatternsView }))
);
// Lazy so the page's text is fetched only by a bowler who opens it.
const LegalView = lazy(() =>
  import("./LegalView").then((m) => ({ default: m.LegalView }))
);

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenBackup, onOpenLineVisualizer, lineVisualizerOpen = false, onOpenArsenal, onOpenSpareLines, onOpenLaneNotes, onOpenLayoutLab, onOpenOilPatternsScreen, onOpenCatalog, onOpenGuides }: SettingsViewProps) {
  const back = () => onSectionChange("menu");

  // The menu stays mounted underneath the pushed section, so popping back
  // reveals it mid-animation instead of sliding onto an empty page.
  return (
    <div className="relative h-full">
      <div className="ios-bounce h-full overflow-y-auto overscroll-contain pb-[var(--tab-clear,0px)]">
        <SettingsMenu
          handedness={handedness}
          onOpenBackup={onOpenBackup}
          onSectionChange={onSectionChange}
          onOpenArsenal={onOpenArsenal}
          onOpenSpareLines={onOpenSpareLines}
          onOpenLaneNotes={onOpenLaneNotes}
        />
      </div>
      {section !== "menu" && (
        <Suspense fallback={null}>
        {section === "lanes" ? (
          <LaneNotesView onBack={back} />
        ) : section === "oil-patterns" ? (
          <OilPatternsView onBack={back} onOpenLineVisualizer={onOpenLineVisualizer} covered={lineVisualizerOpen} />
        ) : section === "appearance" ? (
          <AppearanceView onBack={back} />
        ) : section === "tools" ? (
          // The same list as Home's, so a tool is found from either door.
          <PushScreen mode="inline" title="Tools and reference" onBack={back}>
            <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-6">
              <ToolsList
                onOpenLayoutLab={onOpenLayoutLab}
                onOpenLineVisualizer={() => onOpenLineVisualizer()}
                onOpenOilPatterns={onOpenOilPatternsScreen}
                onOpenCatalog={onOpenCatalog}
                onOpenGuides={onOpenGuides}
              />
            </div>
          </PushScreen>
        ) : section === "legal" ? (
          <LegalView onBack={back} />
        ) : section === "profile" ? (
          <BowlingProfileView
            handedness={handedness}
            onHandednessChange={onHandednessChange}
            driftModel={driftModel}
            onDriftModelChange={onDriftModelChange}
            onBack={back}
          />
        ) : null}
        </Suspense>
      )}
    </div>
  );
}

/**
 * Settings (ADR-115). The places a bowler keeps things (arsenal, spare lines,
 * lane notes) and the tools live on Home; the tools also have one row here,
 * opening the same list, for a bowler who looks for them in Settings. Order is by what a bowler can lose or must not miss: the backup
 * leads, on its own and louder than a row, because the games live on this phone
 * and nowhere else; then the bowler's own things; support; and appearance last,
 * the setting touched once. The bowler's name is the profile chip beside the
 * title, not a row. Hand, grip, PAP and drift share one push behind the
 * "Bowling profile" row, since flipping the hand mirrors every board in the
 * app and is too much to leave one stray tap away on the list.
 */
function SettingsMenu({
  handedness,
  onOpenBackup,
  onSectionChange,
  onOpenArsenal,
  onOpenSpareLines,
  onOpenLaneNotes
}: Pick<
  SettingsViewProps,
  | "handedness"
  | "onOpenBackup"
  | "onSectionChange"
  | "onOpenArsenal"
  | "onOpenSpareLines"
  | "onOpenLaneNotes"
>) {
  const [installOpen, setInstallOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const owned = useProOwned();
  const name = useLiveQuery(getBowlerName, [], undefined);
  // The same test the Dashboard card uses: an installed app has nothing to
  // offer here, and a browser that cannot install would offer a dead end.
  const installable = (isIOSSafari() && !isStandalone()) || canPromptInstall();

  // Live rather than read once at mount: Settings does not unmount when the
  // backup screen is pushed over it, so a mount-only read left the row saying
  // "Never backed up" straight after a backup.
  const lastBackupAt = useLiveQuery(async () => (await getSetting("last_backup_at")) ?? null);
  const backupDescription =
    lastBackupAt === undefined
      ? "Export or import your data"
      : lastBackupAt
        ? `Last backup ${describeAge(lastBackupAt, new Date())}`
        : "Never backed up";
  const grip: GripStyle = useLiveQuery(getGripStyle, [], undefined) ?? "1h";

  // A link that leaves the app says so with the outward arrow, rather than the
  // chevron that means "deeper into this app" on every other row.
  const leavesTheApp = (
    <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
  );


  const initial = name ? [...name][0]?.toUpperCase() : null;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <div className={`${TAB_TITLE_ROW} justify-between gap-3`}>
        <h1 className={TAB_TITLE}>Settings</h1>
        {/* The bowler, as a profile chip: tap it to change the name. Held back
            until the name has loaded, so it never flashes "Add name". */}
        {name !== undefined && (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            aria-label={name ? `Your name, ${name}` : "Add your name"}
            className="flex min-h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full py-1 pl-1 pr-3 active:bg-surface-muted"
          >
            {owned && <ProBadge className="shrink-0" />}
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-fill text-base font-bold text-accent-on-fill"
            >
              {initial ?? <UserRound size={18} />}
            </span>
            <span className="truncate text-sm font-semibold text-ink">{name ?? "Add name"}</span>
          </button>
        )}
      </div>

      {/* Alone, and louder than a row: a lost phone takes every game with it. */}
      <button
        type="button"
        onClick={onOpenBackup}
        className="flex w-full items-center gap-3 rounded-xl border border-accent-fill bg-accent-soft px-3 py-3 text-left shadow-sm active:opacity-80"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill text-accent-on-fill">
          <Archive size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-ink">Backup & restore</span>
          <span className="block truncate text-sm text-ink">{backupDescription}</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent" />
      </button>

      <ListGroup heading="Your bowling">
        <ListRow
          icon={UserRoundCog}
          label="Bowling profile"
          description={`${handedness === "right" ? "Right-handed" : "Left-handed"} · ${
            grip === "2h" ? "Two-handed" : "One-handed"
          }`}
          onClick={() => onSectionChange("profile")}
        />
        <ListRow
          icon={BowlingBallIcon}
          label="Arsenal"
          description="Your balls and their layouts"
          onClick={onOpenArsenal}
        />
        <ListRow
          icon={SpareLineIcon}
          label="Spare lines"
          description="Pre-fill spare lines during score entry"
          onClick={onOpenSpareLines}
        />
        <ListRow
          icon={LanePairIcon}
          label="Lane notes"
          description="How each lane plays at each alley"
          onClick={onOpenLaneNotes}
        />
      </ListGroup>

      {/* The tools are Home's; this is a second door to the same list, for a
          bowler who looks for them here. */}
      <ListGroup>
        <ListRow
          icon={Compass}
          label="Tools and reference"
          description="Layouts, patterns, the catalog and guides"
          onClick={() => onSectionChange("tools")}
        />
      </ListGroup>

      <ProSection />

      <ListGroup heading="Support">
        <ListRow
          icon={MessageSquare}
          label="Send feedback"
          onClick={() => void openFeedbackEmail()}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={ScrollText}
          label="Privacy and terms"
          onClick={() => onSectionChange("legal")}
        />
      </ListGroup>

      <ListGroup heading="App">
        {/* The way back to an install the Home card was waved away from.
            Hidden once the app is installed, when it would offer nothing. */}
        {installable && (
          <ListRow
            icon={Download}
            label="Install Headpin"
            description="Put it on your home screen, so it opens like an app"
            onClick={() => setInstallOpen(true)}
          />
        )}
        <ListRow
          icon={Palette}
          label="Appearance"
          onClick={() => onSectionChange("appearance")}
        />
      </ListGroup>

      <p className="px-1 text-xs text-ink-secondary">Headpin {__APP_VERSION__}</p>

      <InstallPrompt open={installOpen} onClose={() => setInstallOpen(false)} />

      {editingName && name !== undefined && (
        <BowlerNameSheet name={name} onClose={() => setEditingName(false)} />
      )}
    </section>
  );
}

/**
 * Headpin Pro, where the app sells it (the iOS app, ADR-158): bought or not,
 * and, until it is bought, Restore purchase, which App Review requires and a
 * bowler on a new phone needs. On the web, where Pro is not sold, one row to the Pro page wherever
 * Pro is locked, so what Pro adds can be read
 * there (ADR-167). Every row carries the Pro mark, which is what the page shows.
 */
function ProSection() {
  const store = useProStoreContext();
  const access = useProAccess();
  const owned = useProOwned();
  // The Pro page says what Pro is before the purchase is offered (ADR-164).
  const openOffer = useProOffer();
  // Which of the two is waiting on the App Store, so its row says so: a tap
  // that shows nothing for the seconds the store takes reads as a dead button.
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mark = <ProMark size={36} word={false} className="rounded-lg" />;
  if (!store) {
    // Pro merely open (the Android app, a stray address) has nothing to show.
    if (!openOffer || (!access.locked && !owned)) return null;
    return (
      <ListGroup heading="Headpin Pro">
        <ListRow
          leading={mark}
          label="Headpin Pro"
          description={owned ? "Unlocked on this copy" : "See what Pro adds"}
          onClick={openOffer}
        />
      </ListGroup>
    );
  }

  async function run(which: "buy" | "restore", action: (s: ProStore) => Promise<string | null>) {
    if (busy || !store) return;
    setBusy(which);
    setMessage(null);
    try {
      setMessage(await action(store));
    } catch (err) {
      // Say why when the store did: "not available right now" and "offline" call
      // for different things from a bowler, and one line hid both.
      const why = err instanceof Error && err.message ? `: ${err.message}` : ". Try again in a moment.";
      setMessage(`The App Store did not answer${why}`);
    } finally {
      setBusy(null);
    }
  }

  const waiting = "Asking the App Store…";
  const buy = () =>
    run("buy", async (s) => {
      const outcome = await s.buy();
      return outcome === "pending" ? "Waiting for approval. Pro opens as soon as it comes through." : null;
    });
  const restore = () =>
    run("restore", async (s) =>
      (await s.restore()) ? "Headpin Pro is restored." : "This Apple ID has not bought Headpin Pro."
    );

  return (
    <div className="space-y-2">
      <ListGroup heading="Headpin Pro">
        {store.owned ? (
          <ListRow
            leading={mark}
            label="Headpin Pro"
            description="Unlocked. Thank you for backing Headpin."
            trailing={<Check size={16} aria-hidden="true" className="shrink-0 text-accent" />}
            onClick={openOffer ?? undefined}
          />
        ) : (
          <ListRow
            leading={mark}
            label="Get Headpin Pro"
            description={
              busy === "buy"
                ? waiting
                : `${store.price ? `${store.price}, once` : "One purchase"}: every analysis, and every one added later`
            }
            onClick={() => (openOffer ? openOffer() : void buy())}
          />
        )}
        {/* Only while there is something to restore: once Pro is here, a row
            offering to bring it back reads as if it were missing. */}
        {!store.owned && (
          <ListRow
            icon={RotateCcw}
            label="Restore purchase"
            description={busy === "restore" ? waiting : "Bought Pro before on this Apple ID"}
            onClick={() => void restore()}
          />
        )}
      </ListGroup>
      {message && (
        <p role="status" className="px-1 text-sm text-ink-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
