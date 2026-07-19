import { Archive, BookOpen, ChevronLeft, ChevronRight, CircleDot, Coffee, MapPin, MessageSquare, SlidersHorizontal, Spline, type LucideIcon } from "lucide-react";
import { BackupRestoreView } from "./BackupRestoreView";
import { LaneNotesView } from "./LaneNotesView";
import { HandednessView } from "./HandednessView";
import type { Handedness } from "../types/bowling";
import type { DriftModel } from "../lib/driftModel";
import { DONATE_URL, FEEDBACK_URL } from "../lib/links";

export type SettingsSection = "menu" | "arsenal" | "lanes" | "backup" | "preferences";

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

interface MenuRow {
  section: Exclude<SettingsSection, "menu">;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MENU_ROWS: ReadonlyArray<MenuRow> = [
  {
    section: "arsenal",
    label: "Arsenal",
    description: "Manage your bowling balls",
    icon: CircleDot
  },
  {
    section: "lanes",
    label: "Lane Notes",
    description: "Notes per alley + lane",
    icon: MapPin
  },
  {
    section: "backup",
    label: "Backup & Restore",
    description: "Export or import your data",
    icon: Archive
  },
  {
    section: "preferences",
    label: "Preferences",
    description: "Handedness & defaults",
    icon: SlidersHorizontal
  }
];

export function SettingsView({ section, onSectionChange, handedness, onHandednessChange, driftModel, onDriftModelChange, onOpenArsenal, onOpenCatalog, onOpenLineVisualizer }: SettingsViewProps) {
  if (section !== "menu") {
    return (
      <>
        <div className="mx-auto w-full max-w-3xl px-3 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => onSectionChange("menu")}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Settings
          </button>
        </div>
        {section === "lanes" ? (
          <LaneNotesView />
        ) : section === "preferences" ? (
          <HandednessView
            value={handedness}
            onChange={onHandednessChange}
            driftModel={driftModel}
            onDriftModelChange={onDriftModelChange}
          />
        ) : (
          <BackupRestoreView />
        )}
      </>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">Settings</h1>
      <ul className="space-y-1.5">
        {MENU_ROWS.map((row) => {
          const Icon = row.icon;
          const onClick =
            row.section === "arsenal"
              ? onOpenArsenal
              : () => onSectionChange(row.section);
          return (
            <li key={row.section}>
              <button
                type="button"
                onClick={onClick}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-felt-700"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-950">{row.label}</span>
                  <span className="block text-xs text-slate-500">{row.description}</span>
                </span>
                <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
              </button>
            </li>
          );
        })}
        {/* Ball Catalog — navigates to CatalogView */}
        <li>
          <button
            type="button"
            onClick={onOpenCatalog}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-felt-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
              <BookOpen size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">Ball Catalog</span>
              <span className="block text-xs text-slate-500">Browse manufacturer ball specs</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={onOpenLineVisualizer}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-felt-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
              <Spline size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">Line Visualizer</span>
              <span className="block text-xs text-slate-500">Sketch a line on the lane</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
          </button>
        </li>
        <li>
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-felt-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
              <MessageSquare size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">Send feedback</span>
              <span className="block text-xs text-slate-500">Report a bug or share an idea</span>
            </span>
          </a>
        </li>
        <li>
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-felt-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
              <Coffee size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">Buy me a coffee</span>
              <span className="block text-xs text-slate-500">Support the app's development</span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  );
}
