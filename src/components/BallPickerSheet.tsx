import { Check, SlidersHorizontal } from "lucide-react";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";
import { FormSheet } from "./ui/FormSheet";

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
    // The sheet's bar carries the close alone: picking a ball is the commit, so
    // there is no tick to put in the trailing slot (DESIGN-LANGUAGE §1).
    <FormSheet title="Ball" onClose={onClose} size="tall">
      <ul className="space-y-1.5">
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

          {/* A row at the bottom of the list rather than a worded button in the
              bar: the bar holds the close and the commit, and nothing else. */}
          {onOpenArsenal && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenArsenal();
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-2.5 text-left text-sm font-semibold text-accent"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <SlidersHorizontal size={18} aria-hidden="true" />
                </span>
                Manage arsenal
              </button>
            </li>
          )}
        </ul>
    </FormSheet>
  );
}
