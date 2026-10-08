import { Archive, ArrowUpRight, ChevronRight, Coffee, Download, MessageSquare, Palette, ScrollText, UserRound, UserRoundCog } from "lucide-react";
import { AppearanceView } from "./AppearanceView";
import { BowlingProfileView } from "./BowlingProfileView";
import { getBowlerName, getGripStyle, getSetting } from "../services/bowlingRepository";
import { BowlerNameSheet } from "../components/BowlerNameSheet";
import type { GripStyle } from "../types/bowling";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, LEGAL_URL } from "../lib/links";
import { openFeedbackEmail } from "../lib/diagnostics";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
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
  /** Open one guide article: the long form of a one-line caption here. */
  onOpenGuide: (guideId: string) => void;
  /** The same overlays Home opens, so both doors land on the same screen. */
  onOpenArsenal: () => void;
  onOpenSpareLines: () => void;
  onOpenLaneNotes: () => void;
}

/** The guide behind the "Why it matters" links (`lib/guides`). */
const SETTINGS_GUIDE = "your-settings";

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

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenBackup, onOpenLineVisualizer, onOpenGuide, onOpenArsenal, onOpenSpareLines, onOpenLaneNotes }: SettingsViewProps) {
  const back = () => onSectionChange("menu");

  // The menu stays mounted underneath the pushed section, so popping back
  // reveals it mid-animation instead of sliding onto an empty page.
  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
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
          <OilPatternsView onBack={back} onOpenLineVisualizer={onOpenLineVisualizer} />
        ) : section === "appearance" ? (
          <AppearanceView onBack={back} />
        ) : section === "profile" ? (
          <BowlingProfileView
            handedness={handedness}
            onHandednessChange={onHandednessChange}
            driftModel={driftModel}
            onDriftModelChange={onDriftModelChange}
            onOpenGuide={() => onOpenGuide(SETTINGS_GUIDE)}
            onBack={back}
          />
        ) : null}
        </Suspense>
      )}
    </div>
  );
}

/**
 * Only settings (ADR-115). The places a bowler keeps things (arsenal, spare
 * lines, lane notes, patterns) and the tools (catalog, line visualizer) all
 * live on Home. Order is by what a bowler can lose or must not miss: the backup
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        {/* The bowler, as a profile chip: tap it to change the name. Held back
            until the name has loaded, so it never flashes "Add name". */}
        {name !== undefined && (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            aria-label={name ? `Your name, ${name}` : "Add your name"}
            className="flex min-h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full py-1 pl-1 pr-3 active:bg-surface-muted"
          >
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

      <ListGroup heading="Support">
        <ListRow
          icon={MessageSquare}
          label="Send feedback"
          onClick={() => void openFeedbackEmail()}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={Coffee}
          label="Buy me a coffee"
          description="Thanks for your support!"
          href={DONATE_URL}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={ScrollText}
          label="Privacy and terms"
          href={LEGAL_URL}
          trailing={leavesTheApp}
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
          description="Light, dark, or follow your device"
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
