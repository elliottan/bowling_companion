import { canPromptInstall, isIOSSafari, isStandalone, promptInstall } from "../lib/installPrompt";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
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
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  if (!open || isStandalone()) return null;

  const canInstall = canPromptInstall();
  const ios = isIOSSafari();
  if (!canInstall && !ios) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      style={backdropStyle}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">Install Bowling Companion</h2>
        {canInstall ? (
          <>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Add it to your home screen for quick, full-screen access.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => dismiss()}>
                Not now
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await promptInstall();
                  dismiss();
                }}
              >
                Install
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-ink-secondary">
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
