import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BallPickerSheet } from "./BallPickerSheet";
import type { Ball } from "../types/bowling";

const BALLS: Ball[] = [
  { id: 1, name: "Zen Master", is_spare_ball: false, weight: 15 },
  { id: 2, name: "Path", is_spare_ball: true, weight: 15 }
];

function setup(overrides: Partial<Parameters<typeof BallPickerSheet>[0]> = {}) {
  const props = {
    balls: BALLS,
    ballId: undefined,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onOpenArsenal: vi.fn(),
    ...overrides
  };
  render(<BallPickerSheet {...props} />);
  return props;
}

describe("BallPickerSheet", () => {
  /**
   * The sheet lives on the scorer, and the arsenal opens as an overlay above
   * that same tab, so nothing unmounts this sheet on the way out: it has to
   * close itself. It did not. `dismiss(after)` replaces `onClose` rather than
   * running it too, so "Manage arsenal" navigated without ever clearing the
   * sheet's open state, and it slid back up on top of the arsenal.
   */
  it("closes itself as well as opening the arsenal", async () => {
    const { onClose, onOpenArsenal } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Manage arsenal/ }));

    await waitFor(() => expect(onOpenArsenal).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes itself when a ball is picked", async () => {
    const { onSelect, onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Zen Master/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("offers no arsenal shortcut when there is nowhere to go", () => {
    setup({ onOpenArsenal: undefined });

    expect(screen.queryByRole("button", { name: /Manage arsenal/ })).toBeNull();
  });
});
