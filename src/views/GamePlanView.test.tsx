import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import { GamePlanView } from "./GamePlanView";

describe("the alley report with nothing to read", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("says what it will show and what feeds it, and starts a session from there", async () => {
    const onStartScoring = vi.fn();
    render(
      <GamePlanView onBack={vi.fn()} onStartScoring={onStartScoring} />
    );
    expect(await screen.findByText("Bowl a session to see your report")).toBeInTheDocument();
    expect(screen.getByText(/from the games you bowled there/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start scoring" }));
    expect(onStartScoring).toHaveBeenCalled();
  });
});
