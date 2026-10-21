import { ChevronRight } from "lucide-react";
import { ProMark } from "./ui/ProMark";
import { useProAccess } from "../lib/useProAccess";
import { useProEntry } from "./ui/useProAction";

/**
 * A small standing note on Home for a bowler who does not have Pro (ADR-164).
 * It locks nothing and asks for nothing: one tap opens the Pro page, which says
 * what Pro is. It is the free app's one visible ad for it, and it is not there
 * once Pro is open.
 */
export function ProHomeBanner() {
  const access = useProAccess();
  if (!access.locked) return null;
  return <Banner access={access} />;
}

function Banner({ access }: { access: Extract<ReturnType<typeof useProAccess>, { locked: true }> }) {
  const entry = useProEntry(access);
  return (
    <>
      <button
        type="button"
        onClick={entry.start}
        aria-label="Headpin Pro. See what it adds"
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-3 text-left shadow-sm active:bg-surface-muted"
      >
        <ProMark size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">Headpin Pro</span>
          <span className="block text-xs text-ink-secondary">
            Every leave, every ball, layouts and more colors. Pay once.
          </span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
      {entry.dialog}
    </>
  );
}
