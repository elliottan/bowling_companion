import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useOverlay } from "./useOverlay";

// jsdom has no layout, so every element reads as invisible and the hook's
// focusable filter would drop them all. Give them one box each.
const realGetClientRects = HTMLElement.prototype.getClientRects;
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [{ width: 10, height: 10 }] as unknown as DOMRectList;
  };
});
afterAll(() => {
  HTMLElement.prototype.getClientRects = realGetClientRects;
});

function Overlay({ onClose, active = true }: { onClose: () => void; active?: boolean }) {
  const ref = useOverlay<HTMLDivElement>(onClose, active);
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function Page(props: { onClose: () => void; open?: boolean; active?: boolean }) {
  const { onClose, open = true, active } = props;
  return (
    <div>
      <button>trigger</button>
      {open && <Overlay onClose={onClose} active={active} />}
    </div>
  );
}

describe("useOverlay", () => {
  it("focuses the first focusable element on open", () => {
    render(<Page onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab wraps from the last element back to the first", () => {
    render(<Page onClose={vi.fn()} />);
    screen.getByText("last").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("Shift+Tab wraps from the first element to the last", () => {
    render(<Page onClose={vi.fn()} />);
    screen.getByText("first").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("last"));
  });

  it("pulls focus back in when it has escaped the overlay", () => {
    render(<Page onClose={vi.fn()} />);
    screen.getByText("trigger").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("restores focus to the trigger on close", () => {
    const { rerender } = render(<Page onClose={vi.fn()} open={false} />);
    screen.getByText("trigger").focus();
    rerender(<Page onClose={vi.fn()} open />);
    expect(document.activeElement).toBe(screen.getByText("first"));

    rerender(<Page onClose={vi.fn()} open={false} />);
    expect(document.activeElement).toBe(screen.getByText("trigger"));
  });

  it("does nothing while inactive, so only the topmost layer reacts", () => {
    const onClose = vi.fn();
    render(<Page onClose={onClose} active={false} />);
    expect(document.activeElement).not.toBe(screen.getByText("first"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
