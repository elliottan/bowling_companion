import { canPromptInstall, isIOSSafari, isStandalone, promptInstall } from "../lib/installPrompt";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { ShareIosIcon } from "./icons";
import { Button } from "./ui/Button";

interface InstallPromptProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The "add to home screen" sheet. The caller decides when to show it, through
 * `open` / `onClose`: the Dashboard nudges once and then snoozes for 30 days,
 * and the Settings row opens it on demand for anyone who waved the nudge away.
 *
 * On iOS there is no install event to fire, so the sheet has to say the steps
 * out loud, and it has to say them for Safari: on iOS every other browser is
 * Safari underneath, but only Safari itself carries Add to Home Screen.
 */
export function InstallPrompt({ open, onClose }: InstallPromptProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
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
      style={{ ...backdropStyle, ...rootStyle }}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">Install Headpin</h2>
        {canInstall ? (
          <>
            <p className="mt-1.5 text-sm text-ink-secondary">
              A browser tab left alone for a week can clear your scores. Installed, they stay, and the app opens full screen.
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
              In Safari, tap Share{" "}
              <ShareIosIcon size={15} aria-hidden="true" className="inline-block align-text-bottom" />{" "}
              then "Add to Home Screen". Chrome and Firefox on iOS cannot do
              this, so open the page in Safari first.
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
