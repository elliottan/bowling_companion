import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UpdateToast } from "./UpdateToast";
import { setNeedsRefresh, setUpdateFn } from "../lib/swUpdate";

describe("UpdateToast", () => {
  beforeEach(() => {
    setNeedsRefresh(false);
  });

  it("renders nothing when no update is available", () => {
    render(<UpdateToast />);
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  it("appears when an update becomes available", () => {
    render(<UpdateToast />);
    act(() => setNeedsRefresh(true));
    expect(screen.getByText("Update available")).toBeInTheDocument();
  });

  it("dismiss hides the toast", () => {
    render(<UpdateToast />);
    act(() => setNeedsRefresh(true));
    expect(screen.getByText("Update available")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  it("Update button calls applyUpdate via the registered update function", () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(updateFn);

    render(<UpdateToast />);
    act(() => setNeedsRefresh(true));
    fireEvent.click(screen.getByText("Update"));

    expect(updateFn).toHaveBeenCalledWith(true);
  });
});
