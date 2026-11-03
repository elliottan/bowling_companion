import type { PointerEvent as ReactPointerEvent } from "react";

// Tap-gate for a locked (completed) game. Raising the prompt on `change` alone
// let the field focus first, so the keyboard and caret appeared behind the
// dialog; vetoing on pointerdown means the tap never lands on the control.
export const lockedTapBlocker =
  (onEditAttempt?: () => boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (onEditAttempt && !onEditAttempt()) e.preventDefault();
  };
