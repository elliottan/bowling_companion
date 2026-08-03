import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** One sentence on what lives here and how it earns its keep. */
  description: string;
  /** Primary (and optionally secondary) action — the way out of empty. */
  children?: ReactNode;
}

/** The app's one empty state. Every list that can be empty uses it, so "nothing
 *  here yet" reads the same everywhere instead of being a bare grey sentence in
 *  one place and a card in another. */
export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="mt-6 rounded-2xl border border-edge bg-surface px-5 py-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-secondary">{description}</p>
      {children && <div className="mt-4 flex flex-col items-center gap-2">{children}</div>}
    </div>
  );
}
