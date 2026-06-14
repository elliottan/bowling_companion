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
  readOnly?: boolean;
  size?: "default" | "sm";
}

export function PinGrid({
  standingPins,
  availablePins = ALL_PINS,
  onChange,
  readOnly = false,
  size = "default"
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

  const sm = size === "sm";
  const pinSize = sm ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm sm:h-12 sm:w-12";
  const rowGap = sm ? "gap-1.5" : "gap-2 sm:gap-3";
  const pad = sm ? "p-2" : "p-4";
  const maxW = sm ? "max-w-[11rem]" : "max-w-[16rem]";

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${pad}`}
      style={{ touchAction: "none" }}
    >
      <div className={`mx-auto flex w-full flex-col items-center ${rowGap} ${maxW}`}>
        {PIN_ROWS.map((row) => (
          <div key={row.join("-")} className={`flex w-full justify-center ${rowGap}`}>
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
                  disabled={readOnly || !isAvailable}
                  onPointerDown={readOnly ? undefined : (e) => startGesture(e, pin)}
                  onPointerMove={readOnly ? undefined : moveGesture}
                  onPointerUp={readOnly ? undefined : endGesture}
                  onPointerCancel={readOnly ? undefined : endGesture}
                  className={`flex ${pinSize} shrink-0 items-center justify-center rounded-full border font-bold transition ${
                    readOnly ? "cursor-default" : "active:scale-95"
                  } ${
                    isStanding
                      ? "border-slate-400 bg-white text-slate-900 shadow-sm"
                      : "border-slate-200 bg-slate-100 text-slate-300"
                  } ${isAvailable || readOnly ? "" : "cursor-not-allowed opacity-30"}`}
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
