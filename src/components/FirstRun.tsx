import { useRef, useState } from "react";
import { Button } from "./ui/Button";
import { HandednessPicker } from "./HandednessPicker";
import { prepareImport, replaceAllData, type PreparedImport } from "../services/backupRepository";
import type { Handedness } from "../types/bowling";

interface FirstRunProps {
  onSelectHandedness: (value: Handedness) => void;
}

type Step = "welcome" | "handedness" | "restore";

/**
 * The first screen anybody sees, and the only one that owns the whole viewport.
 *
 * It replaced a bare handedness dialog floating over a fully rendered app the
 * user had never seen, which asked a question about board-adjust arrows before
 * anything had explained what the app was.
 *
 * The order matters and is not cosmetic. Handedness is a row in `settings`, and
 * `settings` ride inside every backup, so asking the question *before* offering
 * the restore meant a returning user answered it and then had their answer
 * silently overwritten by their own file. Asking "new or restoring" first is
 * the only order that cannot contradict itself.
 *
 * Install and backup prompts are deliberately absent: they have their own
 * banners on Home (ADR-067, ADR-068), and repeating them here would rebuild the
 * competing-nudge problem those decisions exist to fix.
 */
export function FirstRun({ onSelectHandedness }: FirstRunProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [pending, setPending] = useState<PreparedImport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      // Nothing is written yet: the user confirms against real counts first.
      setPending(await prepareImport(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRestore() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await replaceAllData(pending.backup);
      // A full reload rather than a state update. The database was just
      // replaced wholesale, and this screen sits above state that was read
      // once at boot (handedness, drift model); re-deriving it by hand would
      // be a list nobody can keep complete. If the file carried no handedness,
      // the reload lands back here and asks for it.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The restore failed.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface-sunken"
      role="dialog"
      aria-modal="true"
      aria-label="Set up Headpin"
    >
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        {step === "welcome" && (
          <>
            <img
              src="/icons/icon-192.png"
              alt=""
              width={72}
              height={72}
              className="mb-6 rounded-2xl"
            />
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Headpin</h1>
            <p className="mt-2 text-base text-ink-secondary">
              Keep every game, ball and line from every night you bowl. Your scores stay on this
              phone.
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <Button size="lg" variant="primary" onClick={() => setStep("handedness")}>
                Start fresh
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setStep("restore")}>
                Restore from a backup
              </Button>
            </div>
          </>
        )}

        {step === "handedness" && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Which hand do you bowl with?
            </h1>
            <p className="mt-2 text-base text-ink-secondary">
              Sets which way the board-adjust arrows point. You can change it later in Settings.
            </p>
            <div className="mt-8">
              <HandednessPicker value={null} onSelect={onSelectHandedness} />
            </div>
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="mt-6 self-start text-sm font-semibold text-ink-secondary hover:underline"
            >
              Back
            </button>
          </>
        )}

        {step === "restore" && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Restore from a backup
            </h1>
            <p className="mt-2 text-base text-ink-secondary">
              Pick a Headpin backup file. It brings back your sessions, balls, lines and settings,
              including which hand you bowl with.
            </p>

            {pending ? (
              <div className="mt-6 rounded-lg border border-edge bg-surface p-4">
                <p className="text-sm font-semibold text-ink">This file holds</p>
                <p className="mt-1 text-sm text-ink-secondary">
                  {pending.incoming.sessions} sessions, {pending.incoming.games} games,{" "}
                  {pending.incoming.frames} frames.
                </p>
                {pending.current.sessions > 0 && (
                  <p className="mt-2 text-sm font-semibold text-danger-600">
                    This device already has {pending.current.sessions} sessions. Restoring replaces
                    them.
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
                    Pick another
                  </Button>
                  <Button variant="primary" onClick={handleRestore} disabled={busy}>
                    {busy ? "Restoring..." : "Restore"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button size="lg" variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? "Reading..." : "Choose a file"}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setStep("handedness")}>
                  I do not have one
                </Button>
              </div>
            )}

            {error && <p className="mt-4 text-sm font-semibold text-danger-600">{error}</p>}

            <button
              type="button"
              onClick={() => {
                setPending(null);
                setError("");
                setStep("welcome");
              }}
              className="mt-6 self-start text-sm font-semibold text-ink-secondary hover:underline"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
