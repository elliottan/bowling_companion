import { t } from "@lingui/core/macro";

/**
 * The small capsule beside a ball's name: Owned, as the catalog's rows wear
 * it, and Selected, for a ball picked to compare (ADR-261). Selected is the
 * accent filled, Owned its soft tint, the same pair of edges the map draws.
 */
export function BallTag({ kind }: { kind: "owned" | "selected" }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-1.5 py-0.5 text-caption-2 font-bold uppercase tracking-wide ${
        kind === "selected" ? "bg-accent-fill text-accent-on-fill" : "bg-accent-soft text-accent"
      }`}
    >
      {kind === "selected"
        ? t({ message: "Selected", comment: "A badge on a bowling ball picked to compare with others" })
        : t({ message: "Owned", comment: "A badge on a ball you already have in your arsenal" })}
    </span>
  );
}
