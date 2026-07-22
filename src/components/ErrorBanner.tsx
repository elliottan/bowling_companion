import type { ReactNode } from "react";

/** Inline error message. `role="alert"` makes screen readers announce it the
 *  moment it appears — without it a failure is silent for AT users. */
export function ErrorBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={`rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm font-semibold text-danger-700 ${className}`.trim()}
    >
      {children}
    </p>
  );
}
