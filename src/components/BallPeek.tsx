import { t } from "@lingui/core/macro";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { specsAt } from "../lib/ballCompare";
import { formatFixed } from "../lib/format";
import { useOverlay } from "../lib/useOverlay";
import type { CatalogBall } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";
import { coverstockLabel } from "./catalogLabels";
import { BallTag } from "./BallTag";

/** The card's width, held inside a phone's 16px gutters. */
const WIDTH = 300;
const GUTTER = 16;
/** Roughly the card's height, to choose whether it hangs under or over. */
const HEIGHT = 92;

/**
 * A ball tapped on the graph or in its key, in a small card hung off what was
 * tapped (ADR-261, ADR-262): its photo, name, weight and numbers at it, and a
 * chevron, since the whole card opens the ball's own page. It hangs under the
 * tap, or over it when there is no room below, and stays inside the screen.
 * Drawn as an anchored menu is, with the same clear scrim: a tap anywhere
 * else, Escape or back closes it.
 */
export function BallPeek({
  ball,
  anchor,
  weight,
  selected,
  owned,
  onOpen,
  onClose
}: {
  ball: CatalogBall;
  anchor: DOMRect;
  weight: number;
  selected: boolean;
  owned: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const ref = useOverlay<HTMLDivElement>(onClose);
  const s = specsAt(ball, weight);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - GUTTER * 2);
  const left = Math.max(GUTTER, Math.min(anchor.left + anchor.width / 2 - width / 2, vw - width - GUTTER));
  const below = anchor.bottom + 8 + HEIGHT <= vh - GUTTER;
  const place = below ? { top: anchor.bottom + 8 } : { bottom: vh - anchor.top + 8 };

  const numbers = [
    t({ message: `${{ weight }} lb`, comment: "A ball weight in pounds, short" }),
    s.rg != null ? t({ message: `RG ${{ rg: formatFixed(s.rg, 2) }}`, comment: "Bowling term: a ball's radius of gyration, short, with its value" }) : null,
    s.diff != null ? t({ message: `Diff ${{ diff: formatFixed(s.diff, 3) }}`, comment: "Bowling term: a ball's differential, short, with its value" }) : null,
    ball.coverstockCategory ? coverstockLabel(ball.coverstockCategory) : null
  ].filter(Boolean);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[76]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={ball.name}
        className={`anchored-menu fixed z-[77] animate-menu-in overflow-hidden rounded-[22px] ${below ? "origin-top" : "origin-bottom"}`}
        style={{ width, left, ...place }}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={t`Open ${{ name: ball.name }}`}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-ink/10"
        >
          <span className="block h-12 w-12 shrink-0">
            <CatalogBallImage src={ball.imageThumb} alt="" brand={ball.brand} size="thumb" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{ball.brand}</span>
            <span className="block break-words text-subhead font-semibold leading-tight text-ink">{ball.name}</span>
            <span className="mt-0.5 block text-caption tabular-nums text-ink-secondary">{numbers.join(" · ")}</span>
            {(selected || owned) && (
              <span className="mt-1 flex flex-wrap gap-1">
                {selected && <BallTag kind="selected" />}
                {owned && <BallTag kind="owned" />}
              </span>
            )}
          </span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        </button>
      </div>
    </>,
    document.body
  );
}
