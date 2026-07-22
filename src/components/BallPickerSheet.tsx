import { Check, SlidersHorizontal } from "lucide-react";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";

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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Choose ball">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 flex max-h-[80%] flex-col rounded-t-2xl bg-lane-50 shadow-xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-sm font-semibold text-slate-950">Ball</h2>
          {onOpenArsenal && (
            <button
              type="button"
              onClick={() => { onClose(); onOpenArsenal(); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-felt-700 hover:bg-slate-200"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              Manage arsenal
            </button>
          )}
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
                      ? "border-felt-700 bg-white ring-2 ring-felt-700"
                      : "border-slate-200 bg-white"
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
                      <div className="h-full w-full rounded-full bg-slate-200" aria-hidden="true" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                    {b.name}
                    {b.is_spare_ball && (
                      <span className="ml-1.5 text-xs font-normal text-ink-secondary">spare</span>
                    )}
                  </span>
                  {selected && <Check size={16} className="shrink-0 text-felt-700" aria-hidden="true" />}
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
                  ? "border-felt-700 bg-white text-slate-950 ring-2 ring-felt-700"
                  : "border-slate-200 bg-white text-ink-secondary"
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
