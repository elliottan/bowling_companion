import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESS_SLOP_PX, installPressCancel } from "./pressCancel";

// jsdom has no PointerEvent, so the fields the listener reads are set on a
// plain event by hand.
function pointer(type: string, target: Element, x: number, y: number, pointerType = "touch") {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.assign(e, { pointerId: 1, pointerType });
  target.dispatchEvent(e);
}

describe("installPressCancel", () => {
  let uninstall: () => void;
  let button: HTMLButtonElement;
  const onClick = vi.fn();

  beforeEach(() => {
    uninstall = installPressCancel();
    button = document.createElement("button");
    button.innerHTML = "<span>More</span>";
    button.addEventListener("click", onClick);
    document.body.appendChild(button);
    // A 100 x 40 button at (100, 100).
    button.getBoundingClientRect = () =>
      ({ left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40 }) as DOMRect;
    onClick.mockClear();
  });

  afterEach(() => {
    uninstall();
    button.remove();
  });

  it("presses on a touch that lifts where it landed", () => {
    pointer("pointerdown", button.firstElementChild!, 150, 120);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not press when the finger slid off before lifting", () => {
    pointer("pointerdown", button.firstElementChild!, 150, 120);
    pointer("pointermove", button, 150, 140 + PRESS_SLOP_PX + 20);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forgives a wobble inside the margin, and a finger that came back", () => {
    pointer("pointerdown", button, 150, 120);
    pointer("pointermove", button, 150, 140 + PRESS_SLOP_PX - 4);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    pointer("pointerdown", button, 150, 120);
    pointer("pointermove", button, 400, 400);
    pointer("pointermove", button, 160, 125);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("leaves a mouse alone, and a click with no press before it", () => {
    pointer("pointerdown", button, 150, 120, "mouse");
    pointer("pointermove", button, 400, 400, "mouse");
    button.click();
    button.click();
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
