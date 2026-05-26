import type { PinNumber } from "../types/bowling";

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
  availablePins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  onChange
}: PinGridProps) {
  const standingPinSet = new Set(standingPins);
  const availablePinSet = new Set(availablePins);

  function togglePin(pin: PinNumber) {
    if (!availablePinSet.has(pin)) {
      return;
    }

    const nextPins = standingPinSet.has(pin)
      ? standingPins.filter((item) => item !== pin)
      : [...standingPins, pin];

    onChange(nextPins.sort((first, second) => first - second));
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mx-auto flex max-w-72 flex-col items-center gap-3">
        {PIN_ROWS.map((row) => (
          <div key={row.join("-")} className="flex justify-center gap-3">
            {row.map((pin) => {
              const isStanding = standingPinSet.has(pin);
              const isAvailable = availablePinSet.has(pin);

              return (
                <button
                  key={pin}
                  type="button"
                  aria-pressed={isStanding}
                  disabled={!isAvailable}
                  onClick={() => togglePin(pin)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-bold transition ${
                    isStanding
                      ? "border-red-500 bg-white text-red-700 shadow-sm"
                      : "border-slate-300 bg-slate-900 text-white"
                  } ${
                    isAvailable
                      ? "cursor-pointer hover:scale-105"
                      : "cursor-not-allowed opacity-25"
                  }`}
                >
                  {pin}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-red-500 bg-white" />
          Standing
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-900" />
          Down
        </div>
      </div>
    </div>
  );
}
