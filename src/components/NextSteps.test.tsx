import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { NextSteps } from "./NextSteps";

const noop = () => {};

function renderCard(overrides: Partial<Parameters<typeof NextSteps>[0]> = {}) {
  return render(
    <NextSteps
      onOpenArsenal={noop}
      onOpenSpareLines={noop}
      onOpenOilPatterns={noop}
      onOpenLaneNotes={noop}
      {...overrides}
    />
  );
}

describe("NextSteps", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("asks an empty database for the two things answerable before a first night", async () => {
    renderCard();
    expect(await screen.findByText("Add the balls you throw")).toBeInTheDocument();
    expect(screen.getByText("Write down your spare lines")).toBeInTheDocument();
    // Which pattern you bowl on is learned at the house, so it waits.
    expect(screen.queryByText("Add the pattern you bowl on")).not.toBeInTheDocument();
  });

  it("renders nothing once every gap is filled", async () => {
    await db.balls.add({ name: "Phaze II", is_spare_ball: false });
    await db.spare_lines.add({ pins: [10], strike_offset: { target: 3 } });

    const { container } = renderCard();
    // The heading would arrive with the query, so waiting for a stable empty
    // container is the assertion: nothing shows up a tick later either.
    await waitFor(() => expect(db.balls.count()).resolves.toBe(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("opens the destination a step names", async () => {
    const onOpenArsenal = vi.fn();
    renderCard({ onOpenArsenal });
    fireEvent.click(await screen.findByRole("button", { name: "Add a ball" }));
    expect(onOpenArsenal).toHaveBeenCalledOnce();
  });

  it("retires one step for good without silencing the one beside it", async () => {
    renderCard();
    await screen.findByText("Add the balls you throw");
    // The first "Not now" belongs to the first step listed.
    fireEvent.click(screen.getAllByRole("button", { name: "Not now" })[0]);

    await waitFor(() =>
      expect(screen.queryByText("Add the balls you throw")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Write down your spare lines")).toBeInTheDocument();
    expect(await db.settings.get("next_step_dismissed:arsenal")).toBeDefined();
    expect(await db.settings.get("next_step_dismissed:spare-lines")).toBeUndefined();
  });
});
