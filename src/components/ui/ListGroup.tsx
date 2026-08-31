import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GROUP_HEADING } from "./typography";

interface ListGroupProps {
  /** The band above the group. A string takes the shared small uppercase
   *  heading style; pass a node instead where the heading is a proper name,
   *  which shouting in caps only makes harder to read. Omitted for a lone
   *  group that the screen's own title already names. */
  heading?: ReactNode;
  /** Sits at the trailing end of the heading row: a count, a toggle. */
  headingTrailing?: ReactNode;
  children: ReactNode;
}

/**
 * A group of rows as one inset card with hairline dividers, rather than a stack
 * of separate cards with gaps between them.
 *
 * The gapped stack was what the app had everywhere, and it reads as five
 * unrelated objects that happen to be adjacent. One card per group says the
 * rows belong together, and the heading says what they have in common, which is
 * the whole job of a settings list (DESIGN-LANGUAGE §4).
 */
export function ListGroup({ heading, headingTrailing, children }: ListGroupProps) {
  return (
    <section>
      {(heading || headingTrailing) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
          {typeof heading === "string" ? (
            <h2 className={GROUP_HEADING}>{heading}</h2>
          ) : (
            heading
          )}
          {headingTrailing}
        </div>
      )}
      <ul className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
        {children}
      </ul>
    </section>
  );
}

interface ListRowProps {
  /** A lucide icon, or the app's own ball icon, which matches that shape. */
  icon?: LucideIcon;
  label: string;
  /** One line under the label. Truncated, never wrapped to a third line (§4). */
  description?: string;
  /** Replaces the trailing chevron: an external-link arrow, a current value. */
  trailing?: ReactNode;
  /** A row that opens something. Exactly one of `onClick` or `href`. */
  onClick?: () => void;
  /** A row that leaves the app. Opens in a new tab. */
  href?: string;
  /** Spoken name, when the label alone is not it. */
  ariaLabel?: string;
}

/**
 * The hairline between two rows, drawn by the row below as a pseudo-element so
 * it can start where the text starts. A full-bleed rule under a leading icon
 * cuts the icon column in half; an inset one reads as one list of rows.
 * `LIST_DIVIDER_INSET` is for rows with a 36px leading tile, `LIST_DIVIDER` for
 * rows without one. A row with a leading element of another size composes its
 * own inset onto `LIST_DIVIDER_BASE`.
 */
export const LIST_DIVIDER_BASE =
  "relative before:absolute before:right-0 before:top-0 before:h-px before:bg-edge first:before:hidden";
export const LIST_DIVIDER = `${LIST_DIVIDER_BASE} before:left-3`;
export const LIST_DIVIDER_INSET = `${LIST_DIVIDER_BASE} before:left-[3.75rem]`;

/**
 * One row of a `ListGroup`: the whole row is the tap target that opens the
 * thing, and secondary actions live in the destination rather than beside the
 * label (§4).
 */
export function ListRow({
  icon: Icon,
  label,
  description,
  trailing,
  onClick,
  href,
  ariaLabel
}: ListRowProps) {
  const inner = (
    <>
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{label}</span>
        {description && (
          <span className="block truncate text-xs text-ink-secondary">{description}</span>
        )}
      </span>
      {trailing ?? (
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      )}
    </>
  );

  const className = "flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted";

  return (
    <li className={Icon ? LIST_DIVIDER_INSET : LIST_DIVIDER}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className={className}
        >
          {inner}
        </a>
      ) : (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
          {inner}
        </button>
      )}
    </li>
  );
}
