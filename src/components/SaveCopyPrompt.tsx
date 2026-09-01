import { ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { shareBackup } from "../services/backupRepository";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import type { BackupUrgency } from "../lib/backupNudge";

interface SaveCopyPromptProps {
  /** "due" snoozes on dismiss, "overdue" only hides for this run (ADR-073). */
  urgency: Exclude<BackupUrgency, "none">;
  /** Snooze it for a week. */
  onLater: () => void;
  /** Hide it for this run only, without recording anything. */
  onDismiss: () => void;
}

/**
 * The backup ask, at the moment a game is finished rather than the next time
 * the user opens Home (ADR-068).
 *
 * A browser-tab user who bowls their night and closes the tab may not come
 * back inside the seven days iOS gives them, so the dashboard nudge never gets
 * a chance to speak. This one catches them while the phone is still in their
 * hand and the score they would lose is on screen.
 *
 * It shares directly instead of routing to the backup screen: pulling someone
 * out of a live session to go and find an export button is how a prompt gets
 * dismissed rather than acted on.
 *
 * A bottom toast rather than a block in the page (ADR-073): three games in and
 * it was a red slab sitting between the game bar and the scorecard, pushing the
 * card down the screen every time the user came back to it.
 *
 * It shares the toast slot with the update toast, which sits above it on the
 * rare occasion both are up. Neither is frequent and both can be closed.
 */
export function SaveCopyPrompt({ urgency, onLater, onDismiss }: SaveCopyPromptProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      // A cancelled share records nothing, so the prompt correctly stays up.
      await shareBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[49] flex justify-center px-3"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div
        className={`w-full max-w-sm rounded-xl border p-3 shadow-xl ${
          urgency === "overdue"
            ? "border-danger-200 bg-danger-50 text-danger-700"
            : "border-warning-200 bg-warning-50 text-warning-700"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="flex-1 text-sm font-semibold">
            Saved on this phone only. Save a copy before closing the tab.
          </p>
          {/* Closes it either way. What that means depends on the urgency: a
              week's snooze while it is only due, and until the next launch once
              it is overdue, which is the line ADR-067 drew and ADR-073 keeps. */}
          <IconButton
            variant="default"
            onClick={urgency === "overdue" ? onDismiss : onLater}
            label="Dismiss backup reminder"
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        {error && <p className="mt-2 pl-7 text-xs font-semibold">{error}</p>}
        <div className="mt-2 pl-7">
          <Button variant="primary" onClick={handleSave} disabled={busy}>
            {busy ? "Saving..." : "Save a copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
