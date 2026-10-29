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
 *
 * Drawn as iOS draws an inset grouped list (ADR-191): deep corners and no
 * outline, the fill alone setting it off the page, with the heading in line
 * with the rows' text rather than with the card's edge.
 */
export function ListGroup({ heading, headingTrailing, children }: ListGroupProps) {
  return (
    <section>
      {(heading || headingTrailing) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 px-4">
          {typeof heading === "string" ? (
            <h2 className={GROUP_HEADING}>{heading}</h2>
          ) : (
            heading
          )}
          {headingTrailing}
        </div>
      )}
      <ul className="overflow-hidden rounded-[26px] bg-surface">
        {children}
      </ul>
    </section>
  );
}

interface ListRowProps {
  /** A lucide icon, or the app's own ball icon, which matches that shape. */
  icon?: LucideIcon;
  /** A 30px tile of its own in place of the icon's (the Pro mark). */
  leading?: ReactNode;
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
 * It stops short of the trailing edge too, as iOS's does. `LIST_DIVIDER_INSET`
 * is for rows with a 30px leading tile (16px in, 30, then a 14px gap),
 * `LIST_DIVIDER` for rows without one. A row with a leading element of another size composes its
 * own inset onto `LIST_DIVIDER_BASE`.
 */
export const LIST_DIVIDER_BASE =
  "relative before:absolute before:right-4 before:top-0 before:h-px before:bg-edge first:before:hidden";
export const LIST_DIVIDER = `${LIST_DIVIDER_BASE} before:left-4`;
export const LIST_DIVIDER_INSET = `${LIST_DIVIDER_BASE} before:left-[3.75rem]`;

/**
 * One row of a `ListGroup`: the whole row is the tap target that opens the
 * thing, and secondary actions live in the destination rather than beside the
 * label (§4).
 */
export function ListRow({
  icon: Icon,
  leading,
  label,
  description,
  trailing,
  onClick,
  href,
  ariaLabel
}: ListRowProps) {
  const inner = (
    <>
      {leading}
      {Icon && !leading && (
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent">
          <Icon size={17} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body leading-snug text-ink">{label}</span>
        {description && (
          // Wraps rather than truncating: a longer translation keeps its words.
          <span className="block text-footnote leading-snug text-ink-secondary">{description}</span>
        )}
      </span>
      {trailing ?? (
        <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      )}
    </>
  );

  // An iOS row: 52pt at least, 16 in from the card's edge, the label in the
  // body size and weight rather than bold, which is for headings (ADR-191).
  const className =
    "flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-surface-muted";

  return (
    <li className={Icon || leading ? LIST_DIVIDER_INSET : LIST_DIVIDER}>
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
