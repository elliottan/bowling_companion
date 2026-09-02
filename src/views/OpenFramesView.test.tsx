import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenFramesView } from "./OpenFramesView";
import { db } from "../db/bowlingDb";

/**
 * The view folded a live query's `undefined` into an empty list, so the first
 * frame said "Nothing open yet" to a bowler with a season of open frames.
 */
describe("OpenFramesView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("says it is still reading rather than showing the empty state", () => {
    render(<OpenFramesView onBack={vi.fn()} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Nothing open yet")).not.toBeInTheDocument();
  });

  it("shows the empty state once the read comes back with nothing", async () => {
    render(<OpenFramesView onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Nothing open yet")).toBeInTheDocument());
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
