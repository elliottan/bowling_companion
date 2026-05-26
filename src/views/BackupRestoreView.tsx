import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { exportBackup, importBackup } from "../services/backupRepository";

export function BackupRestoreView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function handleExport() {
    setIsBusy(true);
    setError("");
    setMessage("");

    try {
      const backup = await exportBackup();
      setMessage(
        `Exported ${backup.tables.sessions.length} sessions, ${backup.tables.games.length} games, and ${backup.tables.frames.length} frames.`
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Unable to export backup."
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFile(file?: File) {
    if (!file) {
      return;
    }

    setIsBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await importBackup(file);
      setMessage(
        `Imported ${result.sessions} sessions, ${result.games} games, and ${result.frames} frames.`
      );
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Unable to import backup."
      );
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-felt-700 sm:text-sm">
          Data safety
        </p>
        <h1 className="text-3xl font-bold text-slate-950">Backup & Restore</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Export a local JSON backup or import one back into IndexedDB. Backups
          are validated before any data is merged.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-felt-700 text-white">
              <Download aria-hidden="true" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Export backup</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Download all sessions, games, and frames as one JSON file.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isBusy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download aria-hidden="true" size={18} />
            Export JSON
          </button>
        </div>

        <div
          className="rounded-lg border border-dashed border-slate-300 bg-white p-4 shadow-sm"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void handleFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-lane-100 text-felt-700">
              <Upload aria-hidden="true" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Import backup</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Select or drop a `.json` backup. Imported records are merged
                into the local database.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload aria-hidden="true" size={18} />
            Choose JSON
          </button>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
