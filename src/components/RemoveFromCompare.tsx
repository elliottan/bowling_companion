import { t } from "@lingui/core/macro";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { ANCHORED_MENU_WIDTH, AnchoredMenu, AnchoredMenuItem } from "./ui/AnchoredMenu";

/** Roughly one menu row's height, to choose whether it hangs under or over. */
const ROW = 48;

/**
 * An anchored menu hung off a tapped thing, centred on it: under it, or over it
 * where the screen has no room below for `rows` rows (the tray sits at the
 * foot, a ball page's buttons low on it).
 */
export function MenuOff({ anchor, rows = 1, onClose, children }: { anchor: DOMRect; rows?: number; onClose: () => void; children: ReactNode }) {
  const vw = window.innerWidth;
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - ANCHORED_MENU_WIDTH / 2, vw - ANCHORED_MENU_WIDTH - 8));
  const below = anchor.bottom + 18 + rows * ROW <= window.innerHeight - 8;
  return (
    <AnchoredMenu left={left} {...(below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 })} onClose={onClose}>
      {children}
    </AnchoredMenu>
  );
}

/**
 * The confirmation a tap on a compared ball asks before it leaves the
 * comparison (ADR-266): one red row, Remove from compare, hung off what was
 * tapped, under it or over it where the screen has no room below (the tray
 * sits at the foot). A tap anywhere else, Escape or back keeps the ball.
 */
export function RemoveFromCompare({ anchor, onRemove, onClose }: { anchor: DOMRect; onRemove: () => void; onClose: () => void }) {
  return (
    <MenuOff anchor={anchor} onClose={onClose}>
      <AnchoredMenuItem
        icon={X}
        danger
        onClick={() => {
          onClose();
          onRemove();
        }}
      >
        {t({ message: "Remove from compare", comment: "Confirms taking one bowling ball out of the comparison" })}
      </AnchoredMenuItem>
    </MenuOff>
  );
}
