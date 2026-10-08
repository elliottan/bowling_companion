/**
 * A ring that turns, for a wait the bowler would otherwise take for nothing
 * happening. Still under reduced motion, where the word carries the meaning on
 * its own.
 */
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-ink-secondary">
      <span
        aria-hidden="true"
        className="h-8 w-8 rounded-full border-[3px] border-edge border-t-accent motion-safe:animate-spin"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
