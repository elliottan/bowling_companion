import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { PushScreen } from "../components/PushScreen";
import {
  prepareImport,
  replaceAllData,
  shareBackup,
  type PreparedImport
} from "../services/backupRepository";
import { describeAge } from "../lib/backupNudge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FIELD, FIELD_LABEL } from "../components/ui/field";

interface BackupRestoreViewProps {
  /** Present when pushed as a screen — draws the shared nav bar. */
  onBack?: () => void;
  /** `overlay` when pushed over another tab, `inline` inside Settings. */
  mode?: "inline" | "overlay";
}

export function BackupRestoreView({ onBack, mode = "inline" }: BackupRestoreViewProps = {}) {
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
      const where = await shareBackup();
      if (where === "cancelled") {
        // Nothing left the device, so it is not a backup and must not read as
        // one. `shareBackup` has not recorded it either.
        setMessage("");
      } else if (where === "shared") {
        setMessage("Backup sent. Save it somewhere off this device.");
      } else {
        setMessage("Backup downloaded. Move it somewhere off this device.");
      }
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
        `Replaced all data. You now have ${result.sessions} sessions · ${result.games} games · ${result.frames} frames. A copy of your previous data was downloaded first.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBusy(false);
    }
  }

  const body = (
    <section className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-6">
      <p className="text-sm text-ink-secondary">
        Local JSON only. Importing <strong className="font-semibold text-ink">replaces</strong>{" "}
        everything on this device with the file's contents, so anything not in the
        file is deleted. A copy of your current data downloads first.
      </p>

      {persisted !== null && (
        <p className="mt-2 text-xs text-ink-secondary">
          {persisted
            ? "This browser has agreed not to clear your scores on its own."
            : "This browser may clear your scores if it runs short of space. Install the app and back up."}
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

  if (!onBack) return body;

  return (
    <PushScreen mode={mode} title="Backup & restore" onBack={onBack}>
      {body}
    </PushScreen>
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
  if (!pending) return null;

  const { current, incoming, losingSessions } = pending;
  const age = describeAge(pending.backup.exported_at, new Date());

  return (
    <ConfirmDialog
      open
      title="Replace all data?"
      confirmLabel={isBusy ? "Replacing" : "Replace everything"}
      confirmDisabled={isBusy || confirmText.trim() !== REQUIRED_CONFIRMATION}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <>
          {/* The count of what goes missing, said out loud. Two counts side by
              side read the same whichever way the restore runs (ADR-067). */}
          {losingSessions > 0 && (
            <p className="rounded-lg border border-danger-200 bg-danger-50 p-2 font-semibold text-danger-700">
              This file is older than what is on this device. You would lose{" "}
              {losingSessions} {losingSessions === 1 ? "session" : "sessions"}.
            </p>
          )}
          <p>
            This permanently deletes everything on this device ({current.sessions}{" "}
            {current.sessions === 1 ? "session" : "sessions"}, {current.games}{" "}
            {current.games === 1 ? "game" : "games"}, {current.balls}{" "}
            {current.balls === 1 ? "ball" : "balls"}) and installs the file instead
            ({incoming.sessions} {incoming.sessions === 1 ? "session" : "sessions"},{" "}
            {incoming.games} {incoming.games === 1 ? "game" : "games"}), saved {age}.
          </p>
          <p>A copy of your current data is downloaded first. It is the only way back.</p>
          <label className="block pt-1">
            <span className={FIELD_LABEL}>Type {REQUIRED_CONFIRMATION} to confirm</span>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              className={FIELD}
              placeholder={REQUIRED_CONFIRMATION}
              autoComplete="off"
            />
          </label>
        </>
      }
    />
  );
}
