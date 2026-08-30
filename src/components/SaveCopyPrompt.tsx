import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { shareBackup } from "../services/backupRepository";
import { TAP_TARGET_44 } from "./ui/Chip";
import type { BackupUrgency } from "../lib/backupNudge";

interface SaveCopyPromptProps {
  /** "due" offers Later, "overdue" does not (ADR-067). */
  urgency: Exclude<BackupUrgency, "none">;
  onLater: () => void;
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
 */
export function SaveCopyPrompt({ urgency, onLater }: SaveCopyPromptProps) {
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
      className={`mb-3 rounded-lg border p-3 text-sm ${
        urgency === "overdue"
          ? "border-danger-200 bg-danger-50 text-danger-700"
          : "border-warning-200 bg-warning-50 text-warning-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="flex-1 font-semibold">
          Saved on this phone only. Save a copy before closing the tab.
        </p>
      </div>
      {error && <p className="mt-2 text-xs font-semibold">{error}</p>}
      <div className="mt-2 flex items-center gap-3 pl-7">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className={`relative text-xs font-bold underline hover:no-underline disabled:opacity-60 ${TAP_TARGET_44}`}
        >
          {busy ? "Saving..." : "Save a copy"}
        </button>
        {urgency === "due" && (
          <button
            type="button"
            onClick={onLater}
            className={`relative inline-flex min-w-11 items-center justify-center text-xs font-semibold opacity-80 hover:underline ${TAP_TARGET_44}`}
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
