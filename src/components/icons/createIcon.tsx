import { forwardRef, type ReactNode, type SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: string | number };

/**
 * The shared shell for the app's own glyphs.
 *
 * Bowling ideas get a hand-drawn icon, because Lucide has no pin, no lane and
 * no oil pattern, and the nearest neighbours it does have (Waves for oil,
 * Crosshair for a spare line) say something else. Universal actions stay
 * Lucide. Everything here is on Lucide's grid, 24x24 at stroke 2 with round
 * caps, and takes the same props, so `EmptyState`, `ListRow` and `Fab` accept
 * one wherever they accept a `LucideIcon`.
 */
export function createIcon(displayName: string, children: ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(({ size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  ));
  Icon.displayName = displayName;
  return Icon;
}
