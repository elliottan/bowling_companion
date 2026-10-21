import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoveGamesDialog } from "../MoveGamesDialog";
import { Lock } from "lucide-react";
import { Button } from "./Button";
import { openAppStore, type LockedProAccess } from "../../lib/pro";
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
        <ProAction access={access} />
      </div>
    </div>
  );
}

/**
 * The line a read-only Pro screen carries in place of its controls: the screen
 * itself stays fully drawn and readable, and only changing it waits on Pro
 * (the sandbox, the layout lab). Nothing while Pro is open. `lane` is for the
 * lane view's dark frame, which paints its own colors (DESIGN-LANGUAGE.md §3).
 */
export function ProNote({ what, lane = false }: { what: string; lane?: boolean }) {
  const access = useProAccess();
  if (!access.locked) return null;
  return (
    <div
      className={
        lane
          ? "flex items-center justify-center gap-3 px-4 py-2"
          : "flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm"
      }
    >
      <p className={`flex items-center gap-1.5 text-sm font-semibold ${lane ? "text-white/80" : "text-ink"}`}>
        <Lock size={14} aria-hidden="true" />
        {what}
      </p>
      <ProAction access={access} lane={lane} className="shrink-0" />
    </div>
  );
}

/**
 * The one action a locked card offers. On the web, the App Store page. In the
 * iOS app, the purchase itself (ADR-158): Apple's own sheet takes it from the
 * tap, and the card opens by itself once it is bought, here and everywhere.
 */
export function ProAction({
  access,
  lane = false,
  className = ""
}: {
  access: LockedProAccess;
  lane?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "pending" | "failed">("idle");
  const [moveOpen, setMoveOpen] = useState(false);
  const [why, setWhy] = useState("");

  if ("appStoreUrl" in access) {
    const { appStoreUrl } = access;
    // The steps come first: games bowled here stay in this browser, and the
    // bowler should know how to carry them before they switch.
    return (
      <>
        <Button variant="primary" className={className} onClick={() => setMoveOpen(true)}>
          Get the app
        </Button>
        {moveOpen && (
          <MoveGamesDialog
            onCancel={() => setMoveOpen(false)}
            onContinue={() => {
              setMoveOpen(false);
              openAppStore(appStoreUrl);
            }}
          />
        )}
      </>
    );
  }

  const { store } = access;
  async function buy() {
    setState("busy");
    try {
      setState((await store.buy()) === "pending" ? "pending" : "idle");
    } catch (err) {
      // Say why when the store did: "not available right now" and "offline" are
      // different problems, and one line hid both (as Settings no longer does).
      setWhy(err instanceof Error ? err.message : "");
      setState("failed");
    }
  }
  const note =
    state === "pending"
      ? "Waiting for approval. Pro opens as soon as it comes through."
      : state === "failed"
        ? `The App Store did not answer${why ? `: ${why}` : ". Try again in a moment."}`
        : null;

  return (
    <span className={`flex flex-col items-center gap-1 ${className}`}>
      <Button variant="primary" disabled={state === "busy"} onClick={() => void buy()}>
        {store.price ? `Get Headpin Pro, ${store.price}` : "Get Headpin Pro"}
      </Button>
      {note && (
        <span role="status" className={`max-w-56 text-center text-xs ${lane ? "text-white/80" : "text-ink-secondary"}`}>
          {note}
        </span>
      )}
    </span>
  );
}
