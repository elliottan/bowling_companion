import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exportBackup, importBackup } from "../services/backupRepository";

export function BackupRestoreView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.()
      .then(setPersisted)
      .catch(() => {});
  }, []);

  async function handleExport() {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const backup = await exportBackup();
      setMessage(
        `Exported ${backup.tables.sessions.length} sessions · ${backup.tables.games.length} games · ${backup.tables.frames.length} frames.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await importBackup(file);
      setMessage(
        `Imported ${result.sessions} sessions · ${result.games} games · ${result.frames} frames.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="text-xl font-bold text-slate-950">Backup &amp; Restore</h1>
      <p className="mt-1 text-sm text-slate-600">
        Local JSON only. Imports merge into the existing database by content
        (date + alley name).
      </p>

      {persisted !== null && (
        <p className="mt-2 text-xs text-slate-500">
          {persisted
            ? "Storage: persistent ✓"
            : "Storage: best-effort — install the app + back up regularly"}
        </p>
      )}

      <div
        className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Export JSON
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={16} aria-hidden="true" />
            Import JSON
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Or drop a .json file here.
        </p>
      </div>

      {message && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
