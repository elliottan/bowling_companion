import { forwardRef, type SVGProps } from "react";

type BowlingBallIconProps = SVGProps<SVGSVGElement> & { size?: string | number };

export const BowlingBallIcon = forwardRef<SVGSVGElement, BowlingBallIconProps>(
  ({ size = 24, ...props }, ref) => (
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
      <circle cx="12" cy="12" r="10" />
      <circle cx="9.5" cy="8.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="13" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
);

BowlingBallIcon.displayName = "BowlingBallIcon";
