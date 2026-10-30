import { plural, t } from "@lingui/core/macro";
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
      title={t`Replace all data?`}
      confirmLabel={isBusy ? t`Replacing` : t`Replace everything`}
      confirmDisabled={isBusy || confirmText.trim() !== REQUIRED_CONFIRMATION}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <>
          {/* The count of what goes missing, said out loud. Two counts side by
              side read the same whichever way the restore runs (ADR-067). */}
          {losingSessions > 0 && (
            <p className="rounded-lg border border-danger-200 bg-danger-50 p-2 font-semibold text-danger-700">
              {plural(losingSessions, {
                one: "This file is older than what is on this device. You would lose # session.",
                other: "This file is older than what is on this device. You would lose # sessions."
              })}
            </p>
          )}
          <p>
            {t`This deletes everything on this device: ${plural(current.sessions, {
              one: "# session",
              other: "# sessions"
            })}, ${plural(current.games, { one: "# game", other: "# games" })}, ${plural(current.balls, {
              one: "# ball",
              other: "# balls"
            })}. It installs the file's ${plural(incoming.sessions, {
              one: "# session",
              other: "# sessions"
            })}, ${plural(incoming.games, { one: "# game", other: "# games" })} instead, saved ${age}.`}
          </p>
          {safetyCopy && (
            <p>{t`Headpin downloads a copy of your current data first, so you can undo this.`}</p>
          )}
          <label className="block pt-1">
            <span className={FIELD_LABEL}>{t`Type ${{ word: REQUIRED_CONFIRMATION }} to confirm`}</span>
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
