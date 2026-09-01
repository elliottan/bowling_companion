import { Check, SlidersHorizontal, X } from "lucide-react";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { CatalogBallImage } from "./CatalogBallImage";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

interface BallPickerSheetProps {
  balls: Ball[];
  ballId: number | undefined;
  onSelect: (id: number | undefined) => void;
  onClose: () => void;
  /** Jump to the full arsenal screen (add / edit / reorder). */
  onOpenArsenal?: () => void;
}

/**
 * One-tap ball chooser for the shot panel. Deliberately NOT the arsenal screen:
 * the arsenal row carries edit / delete / drag targets, and a mis-tap there is
 * destructive. This sheet only selects; managing balls is one explicit tap away.
 */
export function BallPickerSheet({
  balls,
  ballId,
  onSelect,
  onClose,
  onOpenArsenal
}: BallPickerSheetProps) {
  const pick = (id: number | undefined) => {
    onSelect(id);
    dismiss();
  };

  const { dismiss, backdropStyle, panelStyle, exiting, dragHandlers } = useSheetDismiss(onClose);
  const overlayRef = useOverlay<HTMLDivElement>(dismiss);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Choose ball">
      <div className="absolute inset-0 bg-black/40" style={backdropStyle} onClick={() => dismiss()} />
      <div
        ref={overlayRef}
        style={panelStyle}
        className={`absolute bottom-0 left-0 right-0 flex max-h-[80%] flex-col rounded-t-2xl bg-surface-sunken shadow-xl ${exiting ? "" : "animate-slide-up"}`}
      >
        {/* Grab handle: drag down to dismiss, the way every iOS sheet does. */}
        <div className="flex touch-none cursor-grab justify-center pt-2 active:cursor-grabbing" {...dragHandlers}>
          <div className="h-1.5 w-10 rounded-full bg-edge-strong" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <h2 className="text-sm font-semibold text-ink">Ball</h2>
          <div className="flex shrink-0 items-center gap-1">
            {/* Close *and* navigate. `dismiss(after)` replaces `onClose` rather
                than running it too, so passing the navigation on its own left
                this sheet's open state set: it played its exit, then slid
                straight back up on top of the arsenal it had just opened. */}
            {onOpenArsenal && (
              <Button
                variant="ghost"
                onClick={() =>
                  dismiss(() => {
                    onClose();
                    onOpenArsenal();
                  })
                }
                className="text-xs"
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                Manage arsenal
              </Button>
            )}
            <IconButton onClick={() => dismiss()} label="Close" variant="round">
              <X size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 pb-6">
          {balls.map((b) => {
            const snap = b.catalog_snapshot;
            const selected = b.id === ballId;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => pick(b.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left ${
                    selected
                      ? "border-accent-fill bg-surface ring-2 ring-accent-fill"
                      : "border-edge bg-surface"
                  }`}
                >
                  <div className="h-10 w-10 shrink-0">
                    {snap ? (
                      <CatalogBallImage
                        src={snap.imageThumb}
                        alt={b.name}
                        brand={snap.brand as Manufacturer}
                        size="thumb"
                      />
                    ) : (
                      <div className="h-full w-full rounded-full bg-edge" aria-hidden="true" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {b.name}
                    {b.is_spare_ball && (
                      <span className="ml-1.5 text-xs font-normal text-ink-secondary">spare</span>
                    )}
                  </span>
                  {selected && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}
                </button>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => pick(undefined)}
              aria-pressed={ballId == null}
              className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm font-semibold ${
                ballId == null
                  ? "border-accent-fill bg-surface text-ink ring-2 ring-accent-fill"
                  : "border-edge bg-surface text-ink-secondary"
              }`}
            >
              <div className="h-10 w-10 shrink-0" aria-hidden="true" />
              No ball
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
