import type { PreparedImport } from "../services/backupRepository";
import { describeAge } from "../lib/backupNudge";
import { ConfirmDialog } from "./ConfirmDialog";
import { FIELD, FIELD_LABEL } from "./ui/field";

const REQUIRED_CONFIRMATION = "REPLACE";

/**
 * Import destroys every local row, and there is no server copy behind it, so
 * the user has to read their own counts and type the word before it runs.
 */
export function ReplaceConfirmDialog({
  pending,
  confirmText,
  onConfirmTextChange,
  isBusy,
  onConfirm,
  onCancel,
  safetyCopy = true
}: {
  pending: PreparedImport | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** False when the device holds nothing, so no copy is written to hand back. */
  safetyCopy?: boolean;
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
            This deletes everything on this device: {current.sessions}{" "}
            {current.sessions === 1 ? "session" : "sessions"}, {current.games}{" "}
            {current.games === 1 ? "game" : "games"}, {current.balls}{" "}
            {current.balls === 1 ? "ball" : "balls"}. It installs the file's{" "}
            {incoming.sessions} {incoming.sessions === 1 ? "session" : "sessions"},{" "}
            {incoming.games} {incoming.games === 1 ? "game" : "games"} instead, saved {age}.
          </p>
          {safetyCopy && (
            <p>A copy of your current data is downloaded first. It is the only way back.</p>
          )}
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
