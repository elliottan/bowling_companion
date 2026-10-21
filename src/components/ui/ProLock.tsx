import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "./Button";
import { ProMark } from "./ProMark";
import type { LockedProAccess } from "../../lib/pro";
import { useProAccess } from "../../lib/useProAccess";
import { useProEntry } from "./useProAction";

/**
 * How Pro shows where it is locked (ADR-163, ADR-167, docs/PRO-LAUNCH.md).
 *
 * Four pieces, each quiet. A card that is Pro shows its first few lines,
 * lightly blurred and fading out, with the lock on it; the whole preview is
 * the tap. A list that is Pro shows its first rows in full and the next one
 * blurred under the mark. Controls that are Pro stay where they are, blurred,
 * under one tap. A screen with several of them says what Pro adds once, in a
 * banner. Nothing pops up, counts down or covers anything but itself.
 */

/** The card's opening lines show, softly, and the rest fades out, so the
 *  bowler sees there is real work behind it without being able to read it. */
const FADE: CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)"
};

/** The mark a locked thing carries. On its own it is the lock and nothing
 *  else: a screen of locks each saying "Pro" read as the same word over and
 *  over (ADR-173). With words, it says what Pro opens there ("Move it with
 *  Pro"). `srLabel` names a bare lock for a screen reader where nothing around
 *  it does. `lane` is the lane view's dark frame, which paints its own colors
 *  (DESIGN-LANGUAGE §3). */
export function ProPill({
  children,
  srLabel,
  lane = false
}: {
  children?: ReactNode;
  srLabel?: string;
  lane?: boolean;
}) {
  const tone = lane
    ? "border border-white/25 bg-slate-900/80 text-white/90 backdrop-blur"
    : "bg-accent-fill text-accent-on-fill";
  if (children == null) {
    return (
      <span
        data-pro-mark=""
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${tone}`}
      >
        <Lock size={14} aria-hidden="true" />
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </span>
    );
  }
  return (
    <span
      data-pro-mark=""
      className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold shadow-sm ${tone}`}
    >
      <Lock size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Takes a preview out of the tab order and the accessibility tree, so no tap
 *  or focus reaches what it covers. React 18 has no `inert` prop. */
function useInert<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.setAttribute("inert", ""), []);
  return ref;
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
 * not: its first lines, lightly blurred and fading out, with the lock in the
 * middle of them, under one tap that is the purchase (or, on the web, the way
 * to the app). It never covers anything but itself.
 *
 * The blur and the lock on the card are what say which card is locked. Sharp,
 * with the mark in room of its own under the fade, the First ball card read as
 * an open card with a stray lock beneath it (ADR-173).
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
  const action = useProEntry(access);
  const previewRef = useInert<HTMLDivElement>();
  return (
    <div>
      <div className="relative">
        <div
          ref={previewRef}
          aria-hidden="true"
          className="pointer-events-none select-none overflow-hidden blur-[2px]"
          style={{ maxHeight: `${peek}rem`, ...FADE }}
        >
          {children}
        </div>
        <button
          type="button"
          disabled={action.busy || action.unavailable}
          onClick={action.start}
          aria-label={`${what}. ${action.label}`}
          className="absolute inset-0 flex items-center justify-center rounded-xl active:opacity-70 disabled:opacity-60"
        >
          <ProPill />
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
  const action = useProEntry(access);
  return (
    <section className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <ProMark size={36} word={false} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Headpin Pro</p>
        <p className="text-xs text-ink-secondary">{what}</p>
        <ActionNote text={action.note} />
      </div>
      <Button variant="primary" disabled={action.busy || action.unavailable} onClick={action.start} className="shrink-0">
        {action.label}
      </Button>
      {action.dialog}
    </section>
  );
}

/**
 * One row of a Pro list past the ones a bowler without Pro reads (ADR-167): the
 * row as it is, blurred, with the small mark on it, and the whole row the tap.
 * The rows after it are not drawn at all; the caller leaves them out
 * (`previewSplit`). The row itself while Pro is open.
 */
export function ProBlur({
  what,
  className = "",
  before,
  children
}: {
  what: string;
  className?: string;
  /** Runs first, for a sheet the row sits in: the Pro page opens under it. */
  before?: () => void;
  children: ReactNode;
}) {
  const access = useProAccess();
  if (!access.locked) return <>{children}</>;
  return (
    <Blurred access={access} what={what} className={className} before={before}>
      {children}
    </Blurred>
  );
}

function Blurred({
  access,
  what,
  className,
  before,
  children
}: {
  access: LockedProAccess;
  what: string;
  className: string;
  before?: () => void;
  children: ReactNode;
}) {
  const action = useProEntry(access);
  const previewRef = useInert<HTMLDivElement>();
  return (
    <div className={`relative ${className}`.trim()}>
      <div ref={previewRef} aria-hidden="true" className="pointer-events-none select-none opacity-70 blur-[3px]">
        {children}
      </div>
      <button
        type="button"
        disabled={action.busy || action.unavailable}
        onClick={() => {
          before?.();
          action.start();
        }}
        aria-label={`${what}. ${action.label}`}
        className="absolute inset-0 flex items-center justify-center rounded-xl active:opacity-70 disabled:opacity-60"
      >
        <ProPill />
      </button>
      {action.dialog}
    </div>
  );
}

/**
 * Controls that are Pro on a screen that is free to read (ADR-167): the layout
 * lab's fields, the lane's pegs. They stay where they are, blurred and out of
 * reach, so a bowler sees what Pro would let them change, and one tap anywhere
 * on them is the way to Pro. The controls themselves while Pro is open.
 *
 * `before` runs first, for a layer the caller has to close so the Pro page is
 * not hidden behind it (the lane). `lane` is the lane view's dark frame. `top`
 * pins the mark to the top centre of the block (the layout lab's sliders)
 * rather than its middle. It never follows the scroll: a mark that rode along
 * read as loose on the screen, sliding over the blurred fields.
 *
 * The blur is light on purpose. The point of the veil is that the bowler can
 * see what is under it, so it only has to say "not yet", not hide anything.
 */
export function ProVeil({
  what,
  label,
  lane = false,
  top = false,
  before,
  className = "",
  children
}: {
  /** What the controls do, for the tap's spoken name. */
  what: string;
  /** The words on the mark, saying what Pro opens here. Left out where there
   *  is no room for them, and the lock stands alone. */
  label?: string;
  lane?: boolean;
  top?: boolean;
  before?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const access = useProAccess();
  if (!access.locked) return <>{children}</>;
  return (
    <Veil access={access} what={what} label={label} lane={lane} top={top} before={before} className={className}>
      {children}
    </Veil>
  );
}

function Veil({
  access,
  what,
  label,
  lane,
  top,
  before,
  className,
  children
}: {
  access: LockedProAccess;
  what: string;
  label?: string;
  lane: boolean;
  top: boolean;
  before?: () => void;
  className: string;
  children: ReactNode;
}) {
  const action = useProEntry(access);
  const previewRef = useInert<HTMLDivElement>();
  return (
    <div className={`relative ${className}`.trim()}>
      <div ref={previewRef} aria-hidden="true" className="pointer-events-none select-none opacity-80 blur-[1px]">
        {children}
      </div>
      <button
        type="button"
        disabled={action.busy || action.unavailable}
        onClick={() => {
          // The lane's own layer would cover the Pro page, so a caller that owns
          // it closes it first.
          before?.();
          action.start();
        }}
        aria-label={`${what}. ${action.label}`}
        className={`absolute inset-0 flex justify-center rounded-xl disabled:opacity-60 ${top ? "items-start pt-3" : "items-center"}`}
      >
        <ProPill lane={lane}>{label}</ProPill>
      </button>
      {action.dialog}
    </div>
  );
}
