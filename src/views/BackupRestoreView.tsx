import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  exportBackup,
  prepareImport,
  replaceAllData,
  type PreparedImport
} from "../services/backupRepository";
import { Button } from "../components/ui/Button";
import { useOverlay } from "../lib/useOverlay";

export function BackupRestoreView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pending, setPending] = useState<PreparedImport | null>(null);
  const [confirmText, setConfirmText] = useState("");

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
      // Nothing is written yet — the user confirms against real counts first.
      setPending(await prepareImport(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirmReplace() {
    if (!pending) return;
    setIsBusy(true);
    setError("");
    try {
      const result = await replaceAllData(pending.backup);
      setPending(null);
      setConfirmText("");
      setMessage(
        `Replaced all data — now ${result.sessions} sessions · ${result.games} games · ${result.frames} frames. A copy of your previous data was downloaded first.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="text-xl font-bold text-ink">Backup &amp; Restore</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Local JSON only. Importing <strong className="font-semibold text-ink">replaces</strong>{" "}
        everything on this device with the file's contents — anything not in the
        file is deleted. A copy of your current data downloads first.
      </p>

      {persisted !== null && (
        <p className="mt-2 text-xs text-ink-secondary">
          {persisted
            ? "Storage: persistent ✓"
            : "Storage: best-effort — install the app + back up regularly"}
        </p>
      )}

      <div
        className="mt-5 rounded-lg border border-edge bg-surface p-4 shadow-sm"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" onClick={handleExport} disabled={isBusy}>
            <Download size={16} aria-hidden="true" />
            Export JSON
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
            <Upload size={16} aria-hidden="true" />
            Import JSON
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-ink-secondary">
          Or drop a .json file here.
        </p>
      </div>

      {message && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-success-200 bg-success-50 p-3 text-sm font-semibold text-success-700"
        >
          {message}
        </p>
      )}
      {error && (
        <ErrorBanner className="mt-3">{error}</ErrorBanner>
      )}

      <ReplaceConfirmDialog
        pending={pending}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        isBusy={isBusy}
        onConfirm={handleConfirmReplace}
        onCancel={() => {
          setPending(null);
          setConfirmText("");
        }}
      />
    </section>
  );
}

const REQUIRED_CONFIRMATION = "REPLACE";

/**
 * Import destroys every local row, and there is no server copy behind it — so
 * the user has to read their own counts and type the word before it runs.
 */
function ReplaceConfirmDialog({
  pending,
  confirmText,
  onConfirmTextChange,
  isBusy,
  onConfirm,
  onCancel
}: {
  pending: PreparedImport | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useOverlay<HTMLDivElement>(onCancel, pending != null);

  if (!pending) return null;

  const { current, incoming } = pending;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        ref={overlayRef}
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">Replace all data?</h2>

        <p className="mt-2 text-sm text-ink-secondary">
          This permanently deletes everything on this device — {current.sessions}{" "}
          {current.sessions === 1 ? "session" : "sessions"}, {current.games}{" "}
          {current.games === 1 ? "game" : "games"}, {current.balls}{" "}
          {current.balls === 1 ? "ball" : "balls"} — and installs the file instead
          ({incoming.sessions} {incoming.sessions === 1 ? "session" : "sessions"},{" "}
          {incoming.games} {incoming.games === 1 ? "game" : "games"}).
        </p>
        <p className="mt-2 text-sm text-ink-secondary">
          A copy of your current data is downloaded first. It is the only way back.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">
            Type {REQUIRED_CONFIRMATION} to confirm
          </span>
          <input
            autoFocus
            value={confirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            className="h-11 w-full box-border rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
            placeholder={REQUIRED_CONFIRMATION}
            autoComplete="off"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isBusy || confirmText.trim() !== REQUIRED_CONFIRMATION}
          >
            {isBusy ? "Replacing…" : "Replace everything"}
          </Button>
        </div>
      </div>
    </div>
  );
}
