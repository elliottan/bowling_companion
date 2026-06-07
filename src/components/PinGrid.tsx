import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PinNumber } from "../types/bowling";
import { ALL_PINS } from "../lib/pins";
import { applyGesture, modeFor, type GestureMode } from "../lib/pinGesture";

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
  const modeRef = useRef<GestureMode | null>(null);
  // Track the evolving standing set within one drag so successive
  // elementFromPoint hits compose instead of clobbering each other.
  const dragStandingRef = useRef<PinNumber[]>(standingPins);

  function pinFromPoint(x: number, y: number): PinNumber | null {
    const el = document.elementFromPoint(x, y);
    const attr = el?.closest<HTMLElement>("[data-pin]")?.dataset.pin;
    if (!attr) return null;
    const pin = Number(attr) as PinNumber;
    return availableSet.has(pin) ? pin : null;
  }

  function startGesture(e: ReactPointerEvent<HTMLButtonElement>, pin: PinNumber) {
    if (!availableSet.has(pin)) return;
    const mode = modeFor(standingPins, pin);
    modeRef.current = mode;
    const next = applyGesture(standingPins, mode, pin);
    dragStandingRef.current = next;
    onChange(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveGesture(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!modeRef.current) return;
    const pin = pinFromPoint(e.clientX, e.clientY);
    if (pin == null) return;
    const next = applyGesture(dragStandingRef.current, modeRef.current, pin);
    if (next === dragStandingRef.current) return; // no-op, skip render
    dragStandingRef.current = next;
    onChange(next);
  }

  function endGesture() {
    modeRef.current = null;
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      style={{ touchAction: "none" }}
    >
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
                  data-pin={pin}
                  aria-pressed={isStanding}
                  aria-label={`Pin ${pin}${isStanding ? " standing" : " down"}`}
                  disabled={!isAvailable}
                  onPointerDown={(e) => startGesture(e, pin)}
                  onPointerMove={moveGesture}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
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
