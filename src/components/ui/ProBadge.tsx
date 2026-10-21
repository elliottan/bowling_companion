/**
 * The small mark that says this copy has Headpin Pro (ADR-164): on the app's
 * mark on Home and beside the bowler in Settings. A label and nothing more, so
 * it is quiet, and it is shown only to a bowler who bought Pro, never where Pro
 * is merely open.
 */
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-accent-fill px-1.5 py-px text-[9px] font-bold uppercase leading-tight tracking-wider text-accent-on-fill ${className}`.trim()}
    >
      Pro
    </span>
  );
}
