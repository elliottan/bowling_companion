import { t } from "@lingui/core/macro";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { moveGamesTitle } from "../lib/moveGames";
import { Button } from "./ui/Button";
import { MoveGamesSteps } from "./MoveGamesSteps";

/**
 * Shown on the web when a bowler taps "Get the app", before the App Store opens:
 * their games live in this browser, and these are the steps that carry them
 * over. Continuing is the only way on, so it is the one primary button.
 */
export function MoveGamesDialog({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onCancel, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, true);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={moveGamesTitle()}
      style={{ ...backdropStyle, ...rootStyle }}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        className={`w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">{moveGamesTitle()}</h2>
        <p className="mt-1.5 text-sm text-ink-secondary">{t`Your games stay in this browser. Bring them along:`}</p>
        <MoveGamesSteps className="mt-2" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dismiss()}>
            {t`Not now`}
          </Button>
          <Button variant="primary" onClick={() => dismiss(onContinue)}>
            {t`Open the App Store`}
          </Button>
        </div>
      </div>
    </div>
  );
}
