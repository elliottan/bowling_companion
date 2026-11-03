import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ask = vi.fn();
let missing = false;
vi.mock("../lib/nativeAlert", () => ({
  askNativeConfirm: (...args: unknown[]) => ask(...args),
  nativeAlertMissing: () => missing
}));

const { ConfirmDialog } = await import("./ConfirmDialog");

function iPhoneApp(on: boolean) {
  Object.assign(globalThis, {
    Capacitor: on ? { isNativePlatform: () => true, getPlatform: () => "ios" } : undefined
  });
}

describe("ConfirmDialog in the iPhone app (ADR-231)", () => {
  beforeEach(() => {
    ask.mockReset();
    missing = false;
  });
  afterEach(() => iPhoneApp(false));

  it("asks a confirm of words through UIKit, draws nothing itself, and runs the answer", async () => {
    iPhoneApp(true);
    ask.mockResolvedValue("confirm");
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Delete this ball?" message="It leaves your arsenal." onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {});
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Delete this ball?", message: "It leaves your arsenal.", destructive: true })
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels on the phone's cancel", async () => {
    iPhoneApp(true);
    ask.mockResolvedValue("cancel");
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Delete?" confirmVariant="primary" onConfirm={vi.fn()} onCancel={onCancel} />);
    await act(async () => {});
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ destructive: false }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("draws its own where the confirm carries more than words, has to be earned, or the plugin is missing", async () => {
    iPhoneApp(true);
    const { unmount } = render(
      <ConfirmDialog open title="Replace all data?" message={<b>12 games</b>} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    unmount();

    render(<ConfirmDialog open title="Replace?" message="Type REPLACE" confirmDisabled onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });

  it("falls back to the page's dialog when the phone cannot ask", async () => {
    iPhoneApp(true);
    // As the real module does: a failed ask marks the plugin missing.
    ask.mockImplementation(async () => {
      missing = true;
      return "unavailable";
    });
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("is the page's own dialog on the web", () => {
    render(<ConfirmDialog open title="Delete?" message="Gone for good." onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });
});
