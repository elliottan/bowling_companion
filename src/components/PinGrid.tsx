import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useHandedness } from "../lib/handednessContext";
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
  /** Control parked in the deck's pocket-side bottom corner (right for a
   *  right-hander), where the ball enters. The deck stays a dumb pin renderer:
   *  it positions whatever it is given and knows nothing about it. */
  cornerSlot?: ReactNode;
}


/**
 * The deck's wood. Maple and a knocked-down pin are the one place in the app
 * that does not take its colours from the theme (DESIGN-LANGUAGE §3): a lane is
 * the same colour in a dark room as a light one, and a pin deck that went slate
 * at night would stop being a pin deck. Exported because the pocket toggle
 * sits on this surface and has to match it.
 */
export const WOOD_PIN_DOWN = "border-[#9c7438] bg-[#c79b5e] text-[#7a5a2c]";

export function PinGrid({
  standingPins,
  availablePins = ALL_PINS,
  onChange,
  readOnly = false,
  size = "default",
  cornerSlot
}: PinGridProps) {
  const handedness = useHandedness();
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
  // The `sm` pins are 32px, below the 44pt HIG target. That is a layout
  // ceiling, not an oversight: the scoring screen puts this deck in a
  // `grid-cols-2` column ~177px wide, and after padding and gaps four pins
  // can't exceed ~35px each. Raising them requires giving the deck more
  // width, which is a scoring-screen layout change, not a sizing tweak.
  const pinSize = sm ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm sm:h-12 sm:w-12";
  const rowGap = sm ? "gap-1.5" : "gap-2 sm:gap-3";
  const pad = sm ? "p-2" : "p-4";
  const maxW = sm ? "max-w-[11rem]" : "max-w-[16rem]";

  return (
    <div
      className={`relative rounded-lg border border-[#d3ac74] shadow-sm ${pad}`}
      style={{
        touchAction: "none",
        backgroundColor: "#ecc78f",
        backgroundImage:
          "repeating-linear-gradient(90deg, rgba(120,72,20,0.14) 0 1px, transparent 1px 14px), linear-gradient(90deg, rgba(255,255,255,0.08), rgba(90,55,15,0.09))"
      }}
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
                  className={`flex ${pinSize} shrink-0 items-center justify-center rounded-full border font-bold ${
                    readOnly ? "cursor-default" : ""
                  } ${
                    isStanding
                      ? "border-[#cbd5e1] bg-white text-[#0f172a] shadow-md"
                      : WOOD_PIN_DOWN
                  } ${isAvailable || readOnly ? "" : "cursor-not-allowed opacity-30"}`}
                >
                  {pin}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {cornerSlot && (
        // A pin drag captures the pointer on the pin it started from, so events
        // released over this corner still belong to that pin and never reach
        // the control here.
        <div
          className={`absolute bottom-1.5 ${handedness === "left" ? "left-1.5" : "right-1.5"}`}
        >
          {cornerSlot}
        </div>
      )}
    </div>
  );
}
