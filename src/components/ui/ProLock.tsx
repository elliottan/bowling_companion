import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MoveGamesDialog } from "../MoveGamesDialog";
import { Lock } from "lucide-react";
import { Button } from "./Button";
import { openAppStore, type LockedProAccess } from "../../lib/pro";
import { useProAccess } from "../../lib/useProAccess";

/**
 * How Pro shows where it is locked (ADR-163, docs/PRO-LAUNCH.md).
 *
 * Three pieces, each quiet. A card that is Pro shows its first few lines as
 * they are, fading out, with one small "Pro" mark; the whole preview is the
 * tap. A screen with several of them says what Pro adds once, in a banner. A
 * screen that is readable but not editable says so in one line. Nothing pops
 * up, counts down or covers anything but itself.
 */

/** The card's opening lines stay sharp and the rest fades out, so the bowler
 *  sees there is real work behind it without being able to read all of it. */
const FADE: CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)"
};

/**
 * The one action a locked thing offers. On the web, the steps for moving games
 * and then the App Store page. In the iOS app, the purchase itself (ADR-158):
 * Apple's own sheet takes it from the tap, and everything opens by itself once
 * it is bought, here and everywhere.
 */
function useProAction(access: LockedProAccess) {
  const [state, setState] = useState<"idle" | "busy" | "pending" | "failed">("idle");
  const [moveOpen, setMoveOpen] = useState(false);
  const [why, setWhy] = useState("");

  if ("appStoreUrl" in access) {
    const { appStoreUrl } = access;
    return {
      label: "Get the app",
      busy: false,
      note: null,
      // The steps come first: games bowled here stay in this browser, and the
      // bowler should know how to carry them before they switch.
      start: () => setMoveOpen(true),
      dialog: moveOpen ? (
        <MoveGamesDialog
          onCancel={() => setMoveOpen(false)}
          onContinue={() => {
            setMoveOpen(false);
            openAppStore(appStoreUrl);
          }}
        />
      ) : null
    };
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
  return {
    label: store.price ? `Get Headpin Pro, ${store.price}` : "Get Headpin Pro",
    busy: state === "busy",
    note:
      state === "pending"
        ? "Waiting for approval. Pro opens as soon as it comes through."
        : state === "failed"
          ? `The App Store did not answer${why ? `: ${why}` : ". Try again in a moment."}`
          : null,
    start: () => void buy(),
    dialog: null
  };
}

function ActionNote({ text, lane = false }: { text: string | null; lane?: boolean }) {
  if (!text) return null;
  return (
    <span role="status" className={`block max-w-56 text-center text-xs ${lane ? "text-white/80" : "text-ink-secondary"}`}>
      {text}
    </span>
  );
}

/**
 * A Pro card, shown as itself while Pro is open and as a teaser while it is
 * not: its first lines as they are, fading out, under one tap that is the
 * purchase (or, on the web, the way to the app). It never covers anything but
 * itself.
 */
export function ProLock({
  what,
  pro = true,
  peek = 9,
  children
}: {
  /** What the card shows a bowler who has Pro. It is the tap's spoken name. */
  what: string;
  /** False when this content is free right now, so a caller can lock it only
   *  for some of its states (the chart, on a Pro metric). */
  pro?: boolean;
  /** How much of the card shows before it fades, in rem. */
  peek?: number;
  children: ReactNode;
}) {
  const access = useProAccess();
  if (!access.locked || !pro) return <>{children}</>;
  return (
    <Teaser access={access} what={what} peek={peek}>
      {children}
    </Teaser>
  );
}

function Teaser({
  access,
  what,
  peek,
  children
}: {
  access: LockedProAccess;
  what: string;
  peek: number;
  children: ReactNode;
}) {
  const action = useProAction(access);
  const previewRef = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop. Inert takes the preview out of the tab order
  // and the accessibility tree, and no tap reaches what it covers.
  useEffect(() => previewRef.current?.setAttribute("inert", ""), []);
  return (
    <div>
      {/* The mark sits in room of its own under the fade, not over the last of
          the text. */}
      <div className="relative pb-8">
        <div
          ref={previewRef}
          aria-hidden="true"
          className="pointer-events-none select-none overflow-hidden"
          style={{ maxHeight: `${peek}rem`, ...FADE }}
        >
          {children}
        </div>
        <button
          type="button"
          disabled={action.busy}
          onClick={action.start}
          aria-label={`${what}. ${action.label}`}
          className="absolute inset-0 flex items-end justify-center rounded-xl pb-0.5 disabled:opacity-60"
        >
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-fill px-3 text-xs font-semibold text-accent-on-fill shadow-sm">
            <Lock size={12} aria-hidden="true" />
            Pro
          </span>
        </button>
      </div>
      <div className="mt-1 flex justify-center">
        <ActionNote text={action.note} />
      </div>
      {action.dialog}
    </div>
  );
}

/**
 * Says once, at the top of a screen with several Pro cards, what Pro adds, with
 * the one place to get it. The cards under it carry only their small mark.
 * Nothing while Pro is open.
 */
export function ProBanner({ what }: { what: string }) {
  const access = useProAccess();
  if (!access.locked) return null;
  return <Banner access={access} what={what} />;
}

function Banner({ access, what }: { access: LockedProAccess; what: string }) {
  const action = useProAction(access);
  return (
    <section className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-fill/15 text-accent">
        <Lock size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Headpin Pro</p>
        <p className="text-xs text-ink-secondary">{what}</p>
        <ActionNote text={action.note} />
      </div>
      <Button variant="primary" disabled={action.busy} onClick={action.start} className="shrink-0">
        {action.label}
      </Button>
      {action.dialog}
    </section>
  );
}

/**
 * The line a read-only Pro screen carries in place of its controls: the screen
 * itself stays fully drawn and readable, and only changing it waits on Pro
 * (the layout lab). One quiet row, no card. Nothing while Pro is open.
 */
export function ProNote({ what }: { what: string }) {
  const access = useProAccess();
  if (!access.locked) return null;
  return <Note access={access} what={what} />;
}

function Note({ access, what }: { access: LockedProAccess; what: string }) {
  const action = useProAction(access);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-secondary">
        <Lock size={13} aria-hidden="true" className="shrink-0" />
        <span>{what}</span>
      </p>
      <button
        type="button"
        disabled={action.busy}
        onClick={action.start}
        aria-label={`${what}. ${action.label}`}
        className="shrink-0 rounded-full px-1 py-2 text-xs font-semibold text-accent active:opacity-60 disabled:opacity-50"
      >
        Unlock
      </button>
      <ActionNote text={action.note} />
      {action.dialog}
    </div>
  );
}

/**
 * A small mark for the lane view's dark frame, which paints its own colors
 * (DESIGN-LANGUAGE.md section 3): a pill in the row of floating controls that
 * says the lane can be read and not moved, and is the way to Pro. Nothing while
 * Pro is open.
 */
export function ProChip({ what }: { what: string }) {
  const access = useProAccess();
  if (!access.locked) return null;
  return <Chip access={access} what={what} />;
}

function Chip({ access, what }: { access: LockedProAccess; what: string }) {
  const action = useProAction(access);
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={action.busy}
        onClick={action.start}
        aria-label={`${what}. ${action.label}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 bg-slate-900/70 px-3 text-xs font-semibold text-white/90 backdrop-blur hover:bg-white/10 disabled:opacity-60"
      >
        <Lock size={13} aria-hidden="true" />
        Unlock editing
      </button>
      <ActionNote text={action.note} lane />
      {action.dialog}
    </div>
  );
}
