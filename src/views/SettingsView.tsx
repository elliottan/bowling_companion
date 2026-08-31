import { Archive, ArrowUpRight, BookOpen, Palette, Coffee, Crosshair, MapPin, MessageSquare, SlidersHorizontal, Spline, Waves, type LucideIcon } from "lucide-react";
import { BowlingBallIcon } from "../components/icons/BowlingBallIcon";
import { useEffect, useState } from "react";
import { LaneNotesView } from "./LaneNotesView";
import { OilPatternsView } from "./OilPatternsView";
import { AppearanceView } from "./AppearanceView";
import { HandednessView } from "./HandednessView";
import { getSetting } from "../services/bowlingRepository";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, FEEDBACK_URL } from "../lib/links";
import { ListGroup, ListRow } from "../components/ui/ListGroup";

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
        : "Never backed up";

  const bowlingRows: Array<{ key: string; icon: LucideIcon; label: string; description: string; onClick: () => void }> = [
    { key: "arsenal", icon: BowlingBallIcon, label: "Arsenal", description: "Manage your bowling balls", onClick: onOpenArsenal },
    { key: "spares", icon: Crosshair, label: "Spare lines", description: "How you shoot each leave", onClick: onOpenSpareLines },
    { key: "lanes", icon: MapPin, label: "Lane notes", description: "Notes per alley and lane", onClick: () => onSectionChange("lanes") },
    { key: "oil-patterns", icon: Waves, label: "Oil patterns", description: "Patterns and their sheet links", onClick: () => onSectionChange("oil-patterns") },
    { key: "preferences", icon: SlidersHorizontal, label: "Preferences", description: "Handedness, release offset, drift", onClick: () => onSectionChange("preferences") },
    { key: "catalog", icon: BookOpen, label: "Ball catalog", description: "Browse manufacturer ball specs", onClick: onOpenCatalog },
    { key: "visualizer", icon: Spline, label: "Line visualizer", description: "Sketch a line on the lane", onClick: onOpenLineVisualizer }
  ];

  // A link that leaves the app says so with the outward arrow, rather than the
  // chevron that means "deeper into this app" on every other row.
  const leavesTheApp = (
    <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
  );

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
      <h1 className="text-xl font-bold text-ink">Settings</h1>

      <ListGroup heading="Bowling">
        {bowlingRows.map((row) => (
          <ListRow
            key={row.key}
            icon={row.icon}
            label={row.label}
            description={row.description}
            onClick={row.onClick}
          />
        ))}
      </ListGroup>

      <ListGroup heading="App">
        <ListRow
          icon={Palette}
          label="Appearance"
          description="Light, dark, or follow your device"
          onClick={() => onSectionChange("appearance")}
        />
      </ListGroup>

      <ListGroup heading="Data & safety">
        <ListRow
          icon={Archive}
          label="Backup & restore"
          description={backupDescription}
          onClick={onOpenBackup}
        />
      </ListGroup>

      <ListGroup heading="Support">
        <ListRow
          icon={MessageSquare}
          label="Send feedback"
          description="Report a bug or share an idea"
          href={FEEDBACK_URL}
          trailing={leavesTheApp}
        />
        <ListRow
          icon={Coffee}
          label="Buy me a coffee"
          description="A one-off tip. No subscription."
          href={DONATE_URL}
          trailing={leavesTheApp}
        />
      </ListGroup>
    </section>
  );
}
