import { Archive, BookOpen, ChevronRight, CircleDot, Coffee, MapPin, MessageSquare, SlidersHorizontal, Spline, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BackupRestoreView } from "./BackupRestoreView";
import { LaneNotesView } from "./LaneNotesView";
import { OilPatternsView } from "./OilPatternsView";
import { HandednessView } from "./HandednessView";
import { getSetting } from "../services/bowlingRepository";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, FEEDBACK_URL } from "../lib/links";

export type SettingsSection = "menu" | "arsenal" | "lanes" | "oil-patterns" | "backup" | "preferences";

interface SettingsViewProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  driftModel: DriftModel;
  onDriftModelChange: (next: DriftModel) => void;
  /** Arsenal opens as a modal overlay rather than an inline section. */
  onOpenArsenal: () => void;
  /** Navigate to the ball catalog view. */
  onOpenCatalog: () => void;
  onOpenLineVisualizer: () => void;
}

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenArsenal, onOpenCatalog, onOpenLineVisualizer }: SettingsViewProps) {
  const back = () => onSectionChange("menu");

  if (section !== "menu") {
    return (
      <>
        {section === "lanes" ? (
          <LaneNotesView onBack={back} />
        ) : section === "oil-patterns" ? (
          <OilPatternsView onBack={back} />
        ) : section === "preferences" ? (
          <HandednessView
            value={handedness}
            onChange={onHandednessChange}
            driftModel={driftModel}
            onDriftModelChange={onDriftModelChange}
            onBack={back}
          />
        ) : (
          <BackupRestoreView onBack={back} />
        )}
      </>
    );
  }

  return <SettingsMenu
    onOpenArsenal={onOpenArsenal}
    onOpenCatalog={onOpenCatalog}
    onOpenLineVisualizer={onOpenLineVisualizer}
    onSectionChange={onSectionChange}
  />;
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
    <h2 className="mb-1.5 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary first:mt-0">
      {children}
    </h2>
  );
}

function SettingsMenu({
  onOpenArsenal,
  onOpenCatalog,
  onOpenLineVisualizer,
  onSectionChange
}: Pick<SettingsViewProps, "onOpenArsenal" | "onOpenCatalog" | "onOpenLineVisualizer" | "onSectionChange">) {
  const [lastBackupAt, setLastBackupAt] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void getSetting("last_backup_at").then((v) => setLastBackupAt(v ?? null));
  }, []);
  const backupDescription =
    lastBackupAt === undefined
      ? "Export or import your data"
      : lastBackupAt
        ? `Last backup ${lastBackupAt.slice(0, 10)}`
        : "Never backed up — export your data";

  const bowlingRows: Array<{ key: string; icon: LucideIcon; label: string; description: string; onClick: () => void }> = [
    { key: "arsenal", icon: CircleDot, label: "Arsenal", description: "Manage your bowling balls", onClick: onOpenArsenal },
    { key: "lanes", icon: MapPin, label: "Lane Notes", description: "Notes per alley + lane", onClick: () => onSectionChange("lanes") },
    { key: "oil-patterns", icon: Waves, label: "Oil Patterns", description: "Patterns and their sheet links", onClick: () => onSectionChange("oil-patterns") },
    { key: "preferences", icon: SlidersHorizontal, label: "Preferences", description: "Handedness & defaults", onClick: () => onSectionChange("preferences") },
    { key: "catalog", icon: BookOpen, label: "Ball Catalog", description: "Browse manufacturer ball specs", onClick: onOpenCatalog },
    { key: "visualizer", icon: Spline, label: "Line Visualizer", description: "Sketch a line on the lane", onClick: onOpenLineVisualizer }
  ];

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">Settings</h1>

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

      <GroupHeading>Data &amp; safety</GroupHeading>
      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={() => onSectionChange("backup")}
            aria-label="Backup & Restore"
            className={ROW_CLASS}
          >
            <RowContent icon={Archive} label="Backup & Restore" description={backupDescription} />
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
            <RowContent icon={Coffee} label="Buy me a coffee" description="Support the app's development" />
          </a>
        </li>
      </ul>
    </section>
  );
}
