import { useEffect, useRef, type ReactNode } from "react";

/**
 * A block that opens downward and closes back up, pushing what is below it
 * down and drawing it back up rather than jumping it a block's height on a
 * frame (ADR-261). The height eases between none and the content's own
 * through a grid row of `0fr` to `1fr`, so nothing has to measure it.
 *
 * Closed, the content stays mounted, so closing can animate, but it is
 * hidden from assistive tech and inert, so neither a tap nor focus reaches
 * it. React 18 has no `inert` prop. Off under `prefers-reduced-motion`.
 */
export function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  return (
    <div
      aria-hidden={open ? undefined : true}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div ref={ref} className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
