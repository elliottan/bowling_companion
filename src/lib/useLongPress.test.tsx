import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useLongPress } from "./useLongPress";

// jsdom has no PointerEvent, so fireEvent.pointerDown/Move drop the
// coordinates. A MouseEvent carries them and React reads the same fields off it.
function pointer(type: "pointerdown" | "pointermove", el: HTMLElement, clientX: number, clientY: number) {
  fireEvent(el, new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function Chip({ onLongPress, onClick }: { onLongPress: () => void; onClick: () => void }) {
  const { bind, didLongPress } = useLongPress();
  return (
    <button
      {...bind(onLongPress)}
      onClick={() => {
        if (didLongPress()) return;
        onClick();
      }}
    >
      chip
    </button>
  );
}

const HOLD = 500;

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    render(<Chip onLongPress={onLongPress} onClick={onClick} />);
    return { onLongPress, onClick, chip: screen.getByText("chip") };
  }

  it("fires after the hold, and swallows the click that follows", () => {
    const { onLongPress, onClick, chip } = setup();
    pointer("pointerdown", chip, 0, 0);
    act(() => void vi.advanceTimersByTime(HOLD));
    expect(onLongPress).toHaveBeenCalledTimes(1);

    fireEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a short press is a plain click", () => {
    const { onLongPress, onClick, chip } = setup();
    pointer("pointerdown", chip, 0, 0);
    act(() => void vi.advanceTimersByTime(HOLD - 1));
    fireEvent.pointerUp(chip);
    act(() => void vi.advanceTimersByTime(HOLD));

    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("moving past the tolerance cancels, so scrolling a chip row is safe", () => {
    const { onLongPress, chip } = setup();
    pointer("pointerdown", chip, 0, 0);
    pointer("pointermove", chip, 0, 11);
    act(() => void vi.advanceTimersByTime(HOLD));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("moving within the tolerance still fires", () => {
    const { onLongPress, chip } = setup();
    pointer("pointerdown", chip, 0, 0);
    pointer("pointermove", chip, 3, 4);
    act(() => void vi.advanceTimersByTime(HOLD));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("only the first click after a press is swallowed", () => {
    const { onClick, chip } = setup();
    pointer("pointerdown", chip, 0, 0);
    act(() => void vi.advanceTimersByTime(HOLD));
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
