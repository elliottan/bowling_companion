import { useState, type ReactNode } from "react";
import { MoveGamesDialog } from "../MoveGamesDialog";
import { openAppStore, type LockedProAccess } from "../../lib/pro";
import { useProOffer } from "../../lib/proOffer";

export interface ProAction {
  /** What the button says: the purchase with its price, or "Get the app". */
  label: string;
  busy: boolean;
  /** One line about how the last try went, or null. */
  note: string | null;
  start: () => void;
  /** The steps for moving games over, while they are up (the web). */
  dialog: ReactNode;
}

/**
 * The one action a locked thing offers. On the web, the steps for moving games
 * and then the App Store page. In the iOS app, the purchase itself (ADR-158):
 * Apple's own sheet takes it from the tap, and everything opens by itself once
 * it is bought, here and everywhere.
 *
 * This is the action that charges. The Pro page runs it from its own button;
 * everything else goes through `useProEntry`.
 */
export function useProAction(access: LockedProAccess): ProAction {
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

/**
 * What a locked card, banner or chip does when it is tapped: open the Pro page
 * when the app has one (ADR-164), and otherwise go straight to the purchase.
 * The label is the same either way, since it names where the bowler is going.
 */
export function useProEntry(access: LockedProAccess): ProAction {
  const direct = useProAction(access);
  const openOffer = useProOffer();
  if (!openOffer) return direct;
  return { ...direct, busy: false, note: null, start: openOffer, dialog: null };
}
