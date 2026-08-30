import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { HandednessPicker } from "./HandednessPicker";
import type { Handedness } from "../types/bowling";

/**
 * First-run gate: which hand you bowl with, asked once because it flips the
 * direction of every board-adjust arrow in the app.
 *
 * A dialog rather than a sheet: it is a question with two buttons, and nothing
 * is typed (DESIGN-LANGUAGE §1). It has no cancel, so the pick is the only way
 * out, and the pick goes through `dismiss` so the answer leaves the way it
 * arrived instead of vanishing on a frame (§7).
 */
export function HandednessPrompt({ onSelect }: { onSelect: (value: Handedness) => void }) {
  const { dismiss, backdropStyle, panelStyle, exiting } = useSheetDismiss(() => {}, "center");
  // `backCloses: false`. Back cannot dismiss a gate that has no answer yet, and
  // registering it in the sheet back stack put a sentinel history entry in front
  // of the route normalisation that rewrites an unreadable URL to the home tab.
  const overlayRef = useOverlay<HTMLDivElement>(() => {}, true, false);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Which hand do you bowl with?"
      style={backdropStyle}
    >
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ${exiting ? "" : "animate-pop-in"}`}
      >
        <h2 className="text-base font-bold text-ink">Which hand do you bowl with?</h2>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Sets which way the board-adjust arrows point. Change it later in Settings.
        </p>
        <div className="mt-4">
          <HandednessPicker value={null} onSelect={(h) => dismiss(() => onSelect(h))} />
        </div>
      </div>
    </div>
  );
}
