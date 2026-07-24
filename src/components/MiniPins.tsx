import type { PinNumber } from "../types/bowling";
import { describePinsStanding } from "../lib/pins";

const ROWS: PinNumber[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

/** Tiny pin diagram: `standing` pins are highlighted (felt), the rest dimmed. */
export function MiniPins({ standing }: { standing: PinNumber[] }) {
  const set = new Set(standing);
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-0.5"
      role="img"
      aria-label={describePinsStanding(standing)}
    >
      {ROWS.map((row) => (
        <div key={row.join("-")} className="flex gap-0.5">
          {row.map((pin) => (
            <div
              key={pin}
              className={`h-3 w-3 rounded-full text-[6px] leading-3 text-center font-bold ${
                set.has(pin) ? "bg-felt-700 text-white" : "bg-surface-muted text-ink-tertiary"
              }`}
            >
              {pin}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
