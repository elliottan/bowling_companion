import { canPromptInstall, isIOSSafari, isStandalone, promptInstall } from "../lib/installPrompt";
import { useOverlay } from "../lib/useOverlay";
import { Button } from "./ui/Button";

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
  const overlayRef = useOverlay<HTMLDivElement>(onClose, open);

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
        ref={overlayRef}
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
              <Button variant="secondary" onClick={onClose}>
                Not now
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await promptInstall();
                  onClose();
                }}
              >
                Install
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-slate-600">
              Tap the Share icon, then &ldquo;Add to Home Screen&rdquo;.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Got it
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
