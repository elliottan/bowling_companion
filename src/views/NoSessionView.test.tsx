import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoSessionView } from "./NoSessionView";

/**
 * The way past the form (ADR-080). A bowler who has never used the app should
 * reach the pin deck without naming a building first.
 */
describe("NoSessionView", () => {
  it("starts a session with nothing filled in, without opening the form", () => {
    const onScoreNow = vi.fn();
    render(
      <NoSessionView
        onStartSession={vi.fn()}
        onScoreNow={onScoreNow}
        isSubmitting={false}
        error=""
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Score now, add details later" }));

    expect(onScoreNow).toHaveBeenCalledTimes(1);
    // The sheet never opened: the point of the button is skipping it.
    expect(screen.queryByLabelText("Alley (optional)")).toBeNull();
  });

  it("still offers the full form", () => {
    render(
      <NoSessionView onStartSession={vi.fn()} onScoreNow={vi.fn()} isSubmitting={false} error="" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    expect(screen.getByLabelText("Alley (optional)")).toBeInTheDocument();
  });

  it("commits the form with the alley left blank", async () => {
    const onStartSession = vi.fn();
    render(
      <NoSessionView
        onStartSession={onStartSession}
        onScoreNow={vi.fn()}
        isSubmitting={false}
        error=""
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    // The sheet's own commit, which used to sit disabled until an alley was typed.
    const commit = screen.getAllByRole("button", { name: "Start session" }).pop()!;
    expect(commit).not.toBeDisabled();
    fireEvent.click(commit);

    await vi.waitFor(() => expect(onStartSession).toHaveBeenCalled());
    expect(onStartSession.mock.calls[0][0]).toMatchObject({ alley_name: "" });
  });
});
