import { PRO_GOLD } from "./ProMark";

/**
 * The small mark that says this copy has Headpin Pro (ADR-164): on the app's
 * mark on Home and beside the bowler in Settings. A label and nothing more, so
 * it is quiet, and it is shown only to a bowler who bought Pro, never where Pro
 * is merely open.
 */
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      // The Pro mark's own graphite and gold (ProMark), not the accent: it is
      // the same mark, small, and the same in every palette.
      style={{ color: PRO_GOLD }}
      className={`rounded-full bg-[#1c232d] px-1.5 py-px text-caption-2 font-bold uppercase leading-tight tracking-wider ring-1 ring-[#e9b949]/40 ${className}`.trim()}
    >
      Pro
    </span>
  );
}
