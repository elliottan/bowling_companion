import type { PinNumber } from "../types/bowling";
import { ALL_PINS } from "../lib/pins";

const PIN_ROWS: PinNumber[][] = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1]
];

interface PinGridProps {
  standingPins: PinNumber[];
  availablePins?: PinNumber[];
  onChange: (standingPins: PinNumber[]) => void;
}

export function PinGrid({
  standingPins,
  availablePins = ALL_PINS,
  onChange
}: PinGridProps) {
  const standingSet = new Set(standingPins);
  const availableSet = new Set(availablePins);

  function togglePin(pin: PinNumber) {
    if (!availableSet.has(pin)) return;

    const next = standingSet.has(pin)
      ? standingPins.filter((p) => p !== pin)
      : [...standingPins, pin];

    onChange(next.sort((a, b) => a - b));
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-2 sm:gap-3">
        {PIN_ROWS.map((row) => (
          <div key={row.join("-")} className="flex w-full justify-center gap-2 sm:gap-3">
            {row.map((pin) => {
              const isStanding = standingSet.has(pin);
              const isAvailable = availableSet.has(pin);
              return (
                <button
                  key={pin}
                  type="button"
                  aria-pressed={isStanding}
                  aria-label={`Pin ${pin}${isStanding ? " standing" : " down"}`}
                  disabled={!isAvailable}
                  onClick={() => togglePin(pin)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition active:scale-95 sm:h-12 sm:w-12 ${
                    isStanding
                      ? "border-slate-300 bg-white text-slate-900"
                      : "border-felt-700 bg-felt-700 text-white"
                  } ${isAvailable ? "" : "cursor-not-allowed opacity-30"}`}
                >
                  {pin}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
