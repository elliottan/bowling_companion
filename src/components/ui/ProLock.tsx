import { useEffect, useRef, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "./Button";
import { openAppStore } from "../../lib/pro";
import { useProAccess } from "../../lib/useProAccess";

/**
 * A Pro card, shown as itself while Pro is open and as a preview while it is
 * not (ADR-154, docs/PRO-LAUNCH.md). The preview keeps the card's place and
 * shape, grayed and blurred so its numbers cannot be read, with one line saying
 * what it shows and one action. It never pops up, never counts down and never
 * covers anything but itself.
 */
export function ProLock({
  what,
  pro = true,
  children
}: {
  /** One line: what the card shows a bowler who has Pro. */
  what: string;
  /** False when this content is free right now, so a caller can lock it only
   *  for some of its states (the chart, on a Pro metric). */
  pro?: boolean;
  children: ReactNode;
}) {
  const access = useProAccess();
  const previewRef = useRef<HTMLDivElement>(null);

  // React 18 has no `inert` prop. Inert takes the preview out of the tab order
  // and the accessibility tree, and no tap reaches what it covers.
  const locked = access.locked && pro;
  useEffect(() => {
    if (locked) previewRef.current?.setAttribute("inert", "");
  }, [locked]);

  if (!access.locked || !pro) return <>{children}</>;
  const { appStoreUrl } = access;

  return (
    <div className="relative">
      <div ref={previewRef} aria-hidden="true" className="pointer-events-none select-none opacity-50 blur-[3px] grayscale">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Lock size={14} aria-hidden="true" />
          {what}
        </p>
        <Button variant="primary" onClick={() => openAppStore(appStoreUrl)}>
          Get the app
        </Button>
      </div>
    </div>
  );
}
