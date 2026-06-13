import { Archive, ChevronLeft, ChevronRight, CircleDot, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ArsenalView } from "./ArsenalView";
import { BackupRestoreView } from "./BackupRestoreView";

type Section = "menu" | "arsenal" | "backup";

interface MenuRow {
  section: Exclude<Section, "menu">;
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
    section: "backup",
    label: "Backup & Restore",
    description: "Export or import your data",
    icon: Archive
  }
];

export function SettingsView() {
  const [section, setSection] = useState<Section>("menu");

  if (section !== "menu") {
    return (
      <>
        <div className="mx-auto w-full max-w-3xl px-3 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSection("menu")}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Settings
          </button>
        </div>
        {section === "arsenal" ? <ArsenalView /> : <BackupRestoreView />}
      </>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">Settings</h1>
      <ul className="space-y-2">
        {MENU_ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.section}>
              <button
                type="button"
                onClick={() => setSection(row.section)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-felt-700"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-950">{row.label}</span>
                  <span className="block text-sm text-slate-500">{row.description}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-slate-400" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
