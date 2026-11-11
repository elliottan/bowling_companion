import { plural, t } from "@lingui/core/macro";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveSafetyCopy, type PreparedImport } from "../services/backupRepository";
import { describeAge } from "../lib/backupNudge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui/Button";

/**
 * Import destroys every local row, and there is no server copy behind it, so
 * it runs in two steps (ADR-274).
 *
 * First the copy: the popup opens by saving one, and stays up with a button
 * to save it again. It says nothing about whether the copy was kept: a web
 * download reports done before the bowler has chosen to keep it, so the app
 * cannot know (ADR-276). Only Continue moves on. Then the confirm: their own
 * counts, and one red button.
 */
export function ReplaceConfirmDialog({
  pending,
  isBusy,
  onConfirm,
  onCancel,
  safetyCopy = true
}: {
  pending: PreparedImport | null;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** False when the device holds nothing, so there is no copy to offer. */
  safetyCopy?: boolean;
}) {
  if (!pending) return null;
  // A fresh file starts again at the copy, with nothing carried over.
  return (
    <ReplaceSteps
      key={pending.backup.exported_at}
      pending={pending}
      isBusy={isBusy}
      onConfirm={onConfirm}
      onCancel={onCancel}
      safetyCopy={safetyCopy}
    />
  );
}

function ReplaceSteps({
  pending,
  isBusy,
  onConfirm,
  onCancel,
  safetyCopy
}: {
  pending: PreparedImport;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  safetyCopy: boolean;
}) {
  const [step, setStep] = useState<"copy" | "confirm">(safetyCopy ? "copy" : "confirm");
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  async function save() {
    setSaving(true);
    try {
      await saveSafetyCopy();
    } catch {
      // The button is still there to try again.
    } finally {
      setSaving(false);
    }
  }

  // The copy is the point of the popup, so opening it saves one. Once, even
  // under StrictMode's double effect: two downloads of one copy is noise.
  useEffect(() => {
    if (step !== "copy" || started.current) return;
    started.current = true;
    void save();
  }, [step]);

  if (step === "copy") {
    return (
      <ConfirmDialog
        key="copy"
        open
        title={t`Save a copy first`}
        confirmVariant="primary"
        confirmLabel={t`Continue`}
        confirmDisabled={saving}
        // Continue opens the confirm rather than closing this, so the dialog
        // that follows takes its place.
        onConfirm={() => setStep("confirm")}
        onCancel={onCancel}
        message={
          <>
            <p>
              {t`Restoring replaces everything on this device. Keep a copy of what is here now, so you can undo it.`}
            </p>
            <Button variant="secondary" onClick={() => void save()} disabled={saving}>
              <Download size={16} aria-hidden="true" />
              {t`Save a copy`}
            </Button>
          </>
        }
      />
    );
  }

  const { current, incoming, losingSessions } = pending;
  const age = describeAge(pending.backup.exported_at, new Date());

  return (
    <ConfirmDialog
      key="confirm"
      open
      title={t`Replace all data?`}
      confirmLabel={isBusy ? t`Replacing` : t`Replace everything`}
      confirmDisabled={isBusy}
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
        </>
      }
    />
  );
}
