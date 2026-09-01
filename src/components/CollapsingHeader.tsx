import type { ReactNode } from "react";

interface CollapsingHeaderProps {
  hidden: boolean;
  children: ReactNode;
}

/**
 * A tab header that gets out of the way as the reader scrolls down, and comes
 * back the moment they scroll up (`useHideOnScroll`).
 *
 * It gives the space back rather than sliding over the content, so the row is
 * animated with grid rows: a `0fr` to `1fr` track is the one height transition
 * that works without knowing the height, and this row's height depends on
 * whether any filter chips are in it.
 *
 * Motion is symmetric, in and out, and both ends are off under
 * `prefers-reduced-motion` (DESIGN-LANGUAGE §7). Off means instant, not absent:
 * the space is worth reclaiming either way, and a reader who has asked for less
 * motion has not asked for less screen.
 */
export function CollapsingHeader({ hidden, children }: CollapsingHeaderProps) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: hidden ? "0fr" : "1fr", opacity: hidden ? 0 : 1 }}
    >
      {/*
        `visibility`, not `aria-hidden`: a collapsed row is still in the tab
        order and still readable, so hiding it from the screen reader alone
        would leave a keyboard user tabbing into controls nobody can see.
        Visibility takes it out of both, and because it is not an animatable
        property it flips at the end of the collapse and at the start of the
        return, which is the timing this wants anyway.
      */}
      <div
        className="overflow-hidden transition-[visibility] duration-200 motion-reduce:transition-none"
        style={{ visibility: hidden ? "hidden" : "visible" }}
      >
        {children}
      </div>
    </div>
  );
}
