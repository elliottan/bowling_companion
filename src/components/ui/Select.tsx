import { ChevronsUpDown } from "lucide-react";
import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { FIELD_DENSE_SELECT, FIELD_DENSE_SELECT_NARROW, FIELD_SELECT } from "./field";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** `field` for a form's full-size field, `dense` for the score panels,
   *  `narrow` for a box holding a digit or a fraction, and `menu` for a
   *  toolbar's choice such as a sort, drawn as iOS draws a pop-up button
   *  there: the value in the accent, with no box at all. */
  variant?: "field" | "dense" | "narrow" | "menu";
  /** Sizes the box: the select itself is `w-full` of it. */
  wrapperClassName?: string;
  children: ReactNode;
}

const CHROME = {
  field: FIELD_SELECT,
  dense: FIELD_DENSE_SELECT,
  narrow: FIELD_DENSE_SELECT_NARROW,
  // 44pt tall with no box: the button is its words.
  menu: "absolute inset-0 h-11 w-full min-w-0 appearance-none truncate rounded-lg bg-transparent pl-1 pr-6 text-subhead font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent-fill/30 active:opacity-60"
};

/** The label of the option `value` picks, for a menu sized to it. */
function chosenLabel(children: ReactNode, value: unknown): ReactNode {
  let label: ReactNode = null;
  Children.forEach(children, (child) => {
    if (label === null && isValidElement<{ value?: unknown; children?: ReactNode }>(child) && String(child.props.value) === String(value)) {
      label = child.props.children;
    }
  });
  return label;
}

/**
 * A pick from a list, drawn as an iOS pop-up button (ADR-230): the value, and
 * the up-and-down chevrons (`chevron.up.chevron.down`) in the accent saying a
 * menu opens from it. Inside the store apps the list itself is the phone's own
 * menu, which WebKit opens for any `<select>`; this is the closed control.
 *
 * Every select used to drop the browser's arrow (`appearance-none`) and leave
 * room for a chevron nothing drew, so a box holding "All alleys" read as a
 * text field, and the one that kept its arrow drew the browser's.
 */
export function Select({ variant = "field", wrapperClassName = "", className = "", children, ...rest }: SelectProps) {
  return (
    <div className={`relative ${variant === "menu" ? "inline-block h-11 max-w-full" : ""} ${wrapperClassName}`.trim()}>
      {/* A pop-up button is as wide as what it says now, as UIKit's is, not
          its longest option: an invisible copy of the chosen label sizes the
          box the select is laid over. */}
      {variant === "menu" && (
        <span aria-hidden="true" className="invisible block truncate whitespace-nowrap pl-2 pr-7 text-subhead font-medium leading-[2.75rem]">
          {chosenLabel(children, rest.value)}
        </span>
      )}
      <select className={`${CHROME[variant]} ${className}`.trim()} {...rest}>
        {children}
      </select>
      <ChevronsUpDown
        size={variant === "field" ? 16 : 13}
        strokeWidth={2.25}
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-accent ${
          variant === "field" ? "right-3.5" : variant === "menu" ? "right-0.5" : "right-1.5"
        }`}
      />
    </div>
  );
}
