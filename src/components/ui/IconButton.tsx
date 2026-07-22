import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "danger" | "solid";

const VARIANT: Record<Variant, string> = {
  default: "text-slate-600 hover:bg-slate-100",
  danger: "text-danger-600 hover:bg-danger-50",
  // Filled treatment for an icon-only action that needs to read as prominent
  // as a primary button. Kept as a variant rather than a className override
  // because Tailwind resolves competing utilities by stylesheet order, not by
  // the order they appear in the class attribute.
  solid: "bg-slate-900 text-white hover:bg-slate-700"
};

/** Shared icon-only button primitive. Fixed at 44x44 (Apple HIG's minimum tap
 *  target) regardless of the icon inside. `label` is required, not optional
 *  — it becomes the `aria-label`, so an icon button with no accessible name
 *  can't be constructed. */
export function IconButton({
  variant = "default",
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
