import { Archive, BookOpen, ChevronRight, Palette, CircleDot, Coffee, Crosshair, MapPin, MessageSquare, SlidersHorizontal, Spline, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { LaneNotesView } from "./LaneNotesView";
import { OilPatternsView } from "./OilPatternsView";
import { AppearanceView } from "./AppearanceView";
import { HandednessView } from "./HandednessView";
import { getSetting } from "../services/bowlingRepository";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, FEEDBACK_URL } from "../lib/links";
import { GROUP_HEADING } from "../components/ui/typography";

// Navigating to a section is a navigation action, so the union lives with the
// rest of the navigation state.
import type { SettingsSection } from "../lib/appNavigation";
export type { SettingsSection };

interface SettingsViewProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  driftModel: DriftModel;
  onDriftModelChange: (next: DriftModel) => void;
  /** Arsenal opens as a modal overlay rather than an inline section. */
  onOpenArsenal: () => void;
  /** Spare lines does too. It is also in the Stats menu, where it is read next
   *  to the leaves you keep missing; here it is one of the things you keep. */
  onOpenSpareLines: () => void;
  /** Backup & restore pushes over the tab, like the arsenal and the catalog:
   *  it is also reachable from the dashboard, and both should land on the same
   *  screen. */
  onOpenBackup: () => void;
  /** Navigate to the ball catalog view. */
  onOpenCatalog: () => void;
  onOpenLineVisualizer: () => void;
}

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenArsenal, onOpenSpareLines, onOpenBackup, onOpenCatalog, onOpenLineVisualizer }: SettingsViewProps) {
  const back = () => onSectionChange("menu");

  // The menu stays mounted underneath the pushed section, so popping back
  // reveals it mid-animation instead of sliding onto an empty page.
  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        <SettingsMenu
          onOpenArsenal={onOpenArsenal}
          onOpenSpareLines={onOpenSpareLines}
          onOpenBackup={onOpenBackup}
          onOpenCatalog={onOpenCatalog}
          onOpenLineVisualizer={onOpenLineVisualizer}
          onSectionChange={onSectionChange}
        />
      </div>
      {section !== "menu" && (
        section === "lanes" ? (
          <LaneNotesView onBack={back} />
        ) : section === "oil-patterns" ? (
          <OilPatternsView onBack={back} />
        ) : section === "appearance" ? (
          <AppearanceView onBack={back} />
        ) : section === "preferences" ? (
          <HandednessView
            value={handedness}
            onChange={onHandednessChange}
            driftModel={driftModel}
            onDriftModelChange={onDriftModelChange}
            onBack={back}
          />
        ) : null
      )}
    </div>
  );
}

function RowContent({ icon: Icon, label, description }: { icon: LucideIcon; label: string; description: string }) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-secondary">{description}</span>
      </span>
    </>
  );
}

const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2.5 text-left shadow-sm hover:border-accent-fill";

function GroupHeading({ children }: { children: string }) {
  return (
    <h2 className={`mb-1.5 mt-5 px-1 ${GROUP_HEADING} first:mt-0`}>
      {children}
    </h2>
  );
}

function SettingsMenu({
  onOpenArsenal,
  onOpenSpareLines,
  onOpenBackup,
  onOpenCatalog,
  onOpenLineVisualizer,
  onSectionChange
}: Pick<SettingsViewProps, "onOpenArsenal" | "onOpenSpareLines" | "onOpenBackup" | "onOpenCatalog" | "onOpenLineVisualizer" | "onSectionChange">) {
  const [lastBackupAt, setLastBackupAt] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void getSetting("last_backup_at").then((v) => setLastBackupAt(v ?? null));
  }, []);
  const backupDescription =
    lastBackupAt === undefined
      ? "Export or import your data"
      : lastBackupAt
        ? `Last backup ${lastBackupAt.slice(0, 10)}`
        : "Never backed up. Export your data";

  const bowlingRows: Array<{ key: string; icon: LucideIcon; label: string; description: string; onClick: () => void }> = [
    { key: "arsenal", icon: CircleDot, label: "Arsenal", description: "Manage your bowling balls", onClick: onOpenArsenal },
    { key: "spares", icon: Crosshair, label: "Spare lines", description: "How you shoot each leave", onClick: onOpenSpareLines },
    { key: "lanes", icon: MapPin, label: "Lane notes", description: "Notes per alley + lane", onClick: () => onSectionChange("lanes") },
    { key: "oil-patterns", icon: Waves, label: "Oil patterns", description: "Patterns and their sheet links", onClick: () => onSectionChange("oil-patterns") },
    { key: "preferences", icon: SlidersHorizontal, label: "Preferences", description: "Handedness, release offset, drift", onClick: () => onSectionChange("preferences") },
    { key: "catalog", icon: BookOpen, label: "Ball catalog", description: "Browse manufacturer ball specs", onClick: onOpenCatalog },
    { key: "visualizer", icon: Spline, label: "Line visualizer", description: "Sketch a line on the lane", onClick: onOpenLineVisualizer }
  ];

  return (
    <section className="mx-auto w-full max-w-3xl px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <h1 className="mb-3 text-xl font-bold text-ink">Settings</h1>

      <GroupHeading>Bowling</GroupHeading>
      <ul className="space-y-1.5">
        {bowlingRows.map((row) => (
          <li key={row.key}>
            <button type="button" onClick={row.onClick} aria-label={row.label} className={ROW_CLASS}>
              <RowContent icon={row.icon} label={row.label} description={row.description} />
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
            </button>
          </li>
        ))}
      </ul>

      <GroupHeading>App</GroupHeading>
      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={() => onSectionChange("appearance")}
            aria-label="Appearance"
            className={ROW_CLASS}
          >
            <RowContent icon={Palette} label="Appearance" description="Light, dark, or follow your device" />
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
          </button>
        </li>
      </ul>

      <GroupHeading>Data &amp; safety</GroupHeading>
      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={onOpenBackup}
            aria-label="Backup & restore"
            className={ROW_CLASS}
          >
            <RowContent icon={Archive} label="Backup & restore" description={backupDescription} />
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
          </button>
        </li>
      </ul>

      <GroupHeading>Support</GroupHeading>
      <ul className="space-y-1.5">
        <li>
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
            <RowContent icon={MessageSquare} label="Send feedback" description="Report a bug or share an idea" />
          </a>
        </li>
        <li>
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
            <RowContent icon={Coffee} label="Buy me a coffee" description="A one-off tip. No subscription." />
          </a>
        </li>
      </ul>
    </section>
  );
}
