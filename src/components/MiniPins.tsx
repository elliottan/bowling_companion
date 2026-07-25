import type { PinNumber } from "../types/bowling";
import { describePinsStanding } from "../lib/pins";

const ROWS: PinNumber[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

const SIZE_CLASSES = {
  xs: "h-3 w-3 text-[6px] leading-3 text-center",
  sm: "h-3.5 w-3.5 text-[7px] leading-[14px] text-center",
  md: "flex h-5 w-5 items-center justify-center text-[9px]",
} as const;

type Size = keyof typeof SIZE_CLASSES;

/** Tiny pin diagram: `standing` pins are highlighted (felt), the rest dimmed. */
export function MiniPins({ standing, size = "xs" }: { standing: PinNumber[]; size?: Size }) {
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
              className={`rounded-full font-bold ${SIZE_CLASSES[size]} ${
                set.has(pin) ? "bg-accent-fill text-accent-on-fill" : "bg-surface-muted text-ink-tertiary"
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
