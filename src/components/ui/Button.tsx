import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent-fill text-accent-on-fill shadow-sm hover:bg-accent-fill-hover",
  secondary: "border border-edge-strong bg-surface text-ink-strong hover:bg-surface-muted",
  danger: "bg-danger-600 text-white shadow-sm hover:bg-danger-700",
  ghost: "text-accent hover:bg-surface-muted"
};

const SIZE: Record<Size, string> = {
  md: "h-11 px-4",
  lg: "h-12 px-5"
};

/** Shared button primitive. Both sizes clear Apple HIG's 44pt minimum tap
 *  target — that floor is the point of this component, not an accident of
 *  styling. Defaults to `type="button"` so it never accidentally submits a
 *  form; pass `type="submit"` explicitly where that's wanted. */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
