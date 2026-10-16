import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import { GamePlanView, describeShot, lineBoards, ofCount } from "./GamePlanView";

/**
 * The counts and groups are `lib/lineReport`'s and are tested there. These are
 * the few words the screen puts around them.
 */
describe("the words on the alley report", () => {
  it("says a count as a count, never a rate", () => {
    expect(ofCount(7, 10)).toBe("7 of 10");
  });

  it("names a line by its boards, or by the one it has", () => {
    expect(lineBoards({ stance: 4, target: 6.5 })).toBe("4 to 6.5");
    expect(lineBoards({ target: 7 })).toBe("target 7");
  });

  it("names a first ball by what it left, and whether that was a pocket hit", () => {
    expect(describeShot({ pinsStanding: [], pocket: true })).toBe("Strike");
    expect(describeShot({ pinsStanding: [10], pocket: true })).toBe("Pin 10, pocket");
    expect(describeShot({ pinsStanding: [2, 4, 5], pocket: false })).toBe("2-4-5");
  });
});

describe("the alley report with nothing to read", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("says what it will show and what feeds it, and starts a session from there", async () => {
    const onStartScoring = vi.fn();
    render(
      <GamePlanView
        onBack={vi.fn()}
        openLineId={null}
        onOpenLine={vi.fn()}
        onOpenSessionGame={vi.fn()}
        onStartScoring={onStartScoring}
      />
    );
    expect(await screen.findByText("Bowl a session to see your report")).toBeInTheDocument();
    expect(screen.getByText(/Name the alley and note your boards/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start scoring" }));
    expect(onStartScoring).toHaveBeenCalled();
  });
});
