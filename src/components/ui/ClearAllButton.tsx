import { t } from "@lingui/core/macro";

/**
 * A filter sheet's way back to no filters: a glass capsule in the sheet's
 * leading corner, where the X would be on a sheet that can be cancelled
 * (`FormSheet`'s `leading`). Every filter sheet carries it in the same place,
 * dimmed while there is nothing to clear, so it is never a line of accent
 * text to hunt for at the sheet's foot (ADR-253, ADR-256).
 */
export function ClearAllButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="glass glass-press inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-ink [--press-scale:1.04] disabled:opacity-40"
    >
      {t({ message: "Clear all", comment: "A button that removes every filter at once" })}
    </button>
  );
}
