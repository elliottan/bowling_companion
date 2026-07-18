import { canPromptInstall, isIOSSafari, isStandalone, promptInstall } from "../lib/installPrompt";

interface InstallPromptProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dismissible sheet offering "Add to Home Screen". Shared component — Phase 4
 * decides *when* to trigger it; this phase only builds it (+ a way to open
 * it, wired by the caller via `open`/`onClose`).
 */
export function InstallPrompt({ open, onClose }: InstallPromptProps) {
  if (!open || isStandalone()) return null;

  const canInstall = canPromptInstall();
  const ios = isIOSSafari();
  if (!canInstall && !ios) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-950">Install Bowling Companion</h2>
        {canInstall ? (
          <>
            <p className="mt-1.5 text-sm text-slate-600">
              Add it to your home screen for quick, full-screen access.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={async () => {
                  await promptInstall();
                  onClose();
                }}
                className="inline-flex h-10 items-center rounded-lg bg-felt-700 px-4 text-sm font-bold text-white shadow-sm"
              >
                Install
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-slate-600">
              Tap the Share icon, then &ldquo;Add to Home Screen&rdquo;.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Got it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
