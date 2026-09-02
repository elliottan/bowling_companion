import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useSheetDismiss } from "./useSheetDismiss";

function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dismiss, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  if (!open) return null;
  return (
    <div data-testid="panel" style={panelStyle} data-exiting={exiting}>
      <button onClick={() => dismiss()}>Cancel</button>
    </div>
  );
}

describe("useSheetDismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a reopened dialog is visible and dismissable again", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));
    act(() => void vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Parent keeps the hook mounted and only flips `open`, the exit state must
    // have reset, or the panel comes back transparent and scaled down.
    rerender(<Dialog open={false} onClose={onClose} />);
    rerender(<Dialog open onClose={onClose} />);

    const panel = screen.getByTestId("panel");
    expect(panel.getAttribute("data-exiting")).toBe("false");
    expect(panel.style.opacity).toBe("");
    expect(panel.style.transform).toBe("");

    fireEvent.click(screen.getByText("Cancel"));
    act(() => void vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
