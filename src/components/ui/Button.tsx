import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-felt-700 text-white shadow-sm hover:bg-felt-600",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "bg-danger-600 text-white shadow-sm hover:bg-danger-700",
  ghost: "text-felt-700 hover:bg-slate-100"
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
