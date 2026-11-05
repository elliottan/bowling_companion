import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "danger" | "solid" | "inverse" | "round" | "confirm" | "lane";

const VARIANT: Record<Variant, string> = {
  default: "text-ink-secondary hover:bg-surface-muted",
  danger: "text-danger-600 hover:bg-danger-50",
  // Filled treatment for an icon-only action that needs to read as prominent
  // as a primary button. Kept as a variant rather than a className override
  // because Tailwind resolves competing utilities by stylesheet order, not by
  // the order they appear in the class attribute.
  solid: "bg-ink text-surface hover:bg-ink/90",
  // For icon buttons on an inverted surface (e.g. the update toast, which
  // sits on bg-ink). text-surface always contrasts against bg-ink, the pair
  // inverts together between themes, so this variant tracks both light and
  // dark automatically instead of hardcoding one direction.
  inverse: "text-surface/70 hover:bg-surface/10 hover:text-surface",
  // Nav-bar and sheet-header chrome: a circular glass control that reads as a
  // control without carrying a word. The glyph is the ink, not the accent, as
  // an iOS 26 bar button's is: on glass the color belongs to the commit.
  //
  // Pressed, it swells under the finger and brightens, as iOS 26's glass does
  // (`.glass-press`), where it used to shrink and dim, which is the older
  // iOS's press. The page draws it everywhere, the iPhone app included
  // (ADR-241).
  round: "glass glass-press rounded-full text-ink",
  // The tinted twin of `round`: a header's confirm, as prominent as a primary
  // button. A variant rather than a className, because competing `bg-*`
  // utilities resolve by stylesheet order and the override loses.
  confirm: "glass-tinted glass-press rounded-full text-accent-on-fill",
  // `round` over the lane view, whose frame is dark in every theme.
  lane: "glass-lane glass-press rounded-full"
};

// `compact` keeps the 44pt hit region while drawing a 20px box, the way `Chip`
// does: an invisible ::after carries the target. Vertically the region is
// anchored to the control's BOTTOM edge rather than centred, so it grows upward
// only. These controls sit in a heading row directly above content, and a
// centred region would hang over whatever is beneath and swallow taps meant for
// it; above is the section's own padding, which has nothing to steal from.
// Horizontally it grows both ways, which is safe because a compact control is
// the trailing item in its row: to one side is a heading, to the other the
// panel's padding, and neither is a tap target.
const COMPACT =
  'relative h-5 w-5 after:absolute after:-left-3 after:-right-3 after:bottom-0 after:h-11 after:content-[""]';

/** Shared icon-only button primitive. Fixed at 44x44 (Apple HIG's minimum tap
 *  target) regardless of the icon inside, or 44pt of hit region around a 20px
 *  box with `compact`. `label` is required, not optional: it becomes the
 *  `aria-label`, so an icon button with no accessible name can't be
 *  constructed. */
export function IconButton({
  variant = "default",
  compact = false,
  label,
  badge,
  className = "",
  children,
  onPointerDown,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  compact?: boolean;
  label: string;
  /** A count on the button's top corner (the filters applied). Part of the
   *  button rather than beside it. */
  badge?: number;
  children: ReactNode;
}) {
  const glass = variant === "round" || variant === "confirm";
  const shownBadge = badge && badge > 0 ? String(badge) : undefined;
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        // Where the finger landed, for the glow the press spreads from.
        if (glass || variant === "lane") {
          const box = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--press-x", `${e.clientX - box.left}px`);
          e.currentTarget.style.setProperty("--press-y", `${e.clientY - box.top}px`);
        }
        onPointerDown?.(e);
      }}
      className={`relative inline-flex shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${compact ? COMPACT : "h-11 w-11"} ${variant === "round" || variant === "confirm" || variant === "lane" ? "" : "rounded-md"} ${VARIANT[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
      {shownBadge && (
        // Flush with the button's top, not above it: the Stats and History
        // headers sit in a box that clips at its top edge (FloatingHeader),
        // and a badge poking 2px over that edge lost its top, number and all.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fill px-1 text-caption-2 font-bold tabular-nums text-accent-on-fill"
        >
          {shownBadge}
        </span>
      )}
    </button>
  );
}
