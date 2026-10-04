import { Archive, ArrowUpRight, Coffee, Download, MessageSquare, Palette, ScrollText, SlidersHorizontal } from "lucide-react";
import { AppearanceView } from "./AppearanceView";
import { HandednessView } from "./HandednessView";
import { getGripStyle, getPap, getSetting, setGripStyle } from "../services/bowlingRepository";
import { DEFAULT_PAP, formatInches } from "../lib/ballLayout";
import { HandednessPicker } from "../components/HandednessPicker";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { GROUP_HEADING } from "../components/ui/typography";
import { LIST_DIVIDER } from "../components/ui/ListGroup";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import type { GripStyle } from "../types/bowling";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, LEGAL_URL } from "../lib/links";
import { openFeedbackEmail } from "../lib/diagnostics";
import { ListGroup, ListRow } from "../components/ui/ListGroup";

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

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenBackup, onOpenLineVisualizer, onOpenGuide }: SettingsViewProps) {
  const back = () => onSectionChange("menu");

  // The menu stays mounted underneath the pushed section, so popping back
  // reveals it mid-animation instead of sliding onto an empty page.
  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        <SettingsMenu
          handedness={handedness}
          onHandednessChange={onHandednessChange}
          driftModel={driftModel}
          onOpenBackup={onOpenBackup}
          onOpenGuide={onOpenGuide}
          onSectionChange={onSectionChange}
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
        ) : section === "preferences" ? (
          <HandednessView
            value={handedness}
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
 * Only settings (ADR-115). The places a bowler keeps things (arsenal, spare
 * lines, lane notes, patterns) and the tools (catalog, line visualizer) all
 * live on Home; this list used to repeat six of them with Preferences hidden in
 * the middle. The two answers every bowler gives are rows here, answered in
 * place, and the numbers only the lane view and the layout lab read sit under
 * Advanced.
 */
function SettingsMenu({
  handedness,
  onHandednessChange,
  driftModel,
  onOpenBackup,
  onOpenGuide,
  onSectionChange
}: Pick<
  SettingsViewProps,
  "handedness" | "onHandednessChange" | "driftModel" | "onOpenBackup" | "onOpenGuide" | "onSectionChange"
>) {
  const [installOpen, setInstallOpen] = useState(false);
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
  const pap = useLiveQuery(getPap, [], undefined) ?? DEFAULT_PAP;
  const advancedDescription = `PAP ${formatInches(pap.over)} over, ${formatInches(Math.abs(pap.up))} ${
    pap.up < 0 ? "down" : "up"
  } · offset ${driftModel.release_offset}`;

  // A link that leaves the app says so with the outward arrow, rather than the
  // chevron that means "deeper into this app" on every other row.
  const leavesTheApp = (
    <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
  );

  const whyLink = (
    <button
      type="button"
      onClick={() => onOpenGuide(SETTINGS_GUIDE)}
      className={`relative text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
    >
      Why it matters
    </button>
  );

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <h1 className="text-xl font-bold text-ink">Settings</h1>

      <ListGroup heading="Bowler" headingTrailing={whyLink}>
        <li className={`${LIST_DIVIDER} px-3 py-3`}>
          <p className="mb-2 text-sm font-semibold text-ink">Handedness</p>
          <HandednessPicker value={handedness} onSelect={onHandednessChange} />
          <p className="mt-1.5 text-xs text-ink-secondary">Boards count in from your side of the lane.</p>
        </li>
        <li className={`${LIST_DIVIDER} px-3 py-3`}>
          <p className="mb-2 text-sm font-semibold text-ink">Grip</p>
          <SegmentedControl
            label="Grip style"
            value={grip}
            onChange={(next) => void setGripStyle(next)}
            options={[
              { value: "1h", label: "One-handed" },
              { value: "2h", label: "Two-handed" }
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-secondary">How the layout lab draws your ball.</p>
        </li>
        <ListRow
          icon={Palette}
          label="Appearance"
          description="Light, dark, or follow your device"
          onClick={() => onSectionChange("appearance")}
        />
      </ListGroup>

      <section>
        <div className="mb-1.5 px-1">
          <h2 className={GROUP_HEADING}>Advanced</h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Used by the lane view and the layout lab. Not needed to keep score.
          </p>
        </div>
        <ul className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
          <ListRow
            icon={SlidersHorizontal}
            label="PAP, release and drift"
            description={advancedDescription}
            onClick={() => onSectionChange("preferences")}
          />
        </ul>
      </section>

      <ListGroup heading="Your data">
        <ListRow
          icon={Archive}
          label="Backup & restore"
          description={backupDescription}
          onClick={onOpenBackup}
        />
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
      </ListGroup>

      <ListGroup heading="Support">
        <ListRow
          icon={MessageSquare}
          label="Send feedback"
          description="Opens an email, with your app version filled in"
          onClick={() => void openFeedbackEmail()}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={Coffee}
          label="Buy me a coffee"
          description="A one-off tip. No subscription."
          href={DONATE_URL}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={ScrollText}
          label="Privacy and terms"
          description="What stays on your device, and what does not"
          href={LEGAL_URL}
          trailing={leavesTheApp}
        />
      </ListGroup>

      <p className="px-1 text-xs text-ink-tertiary">Headpin {__APP_VERSION__}</p>

      <InstallPrompt open={installOpen} onClose={() => setInstallOpen(false)} />
    </section>
  );
}
