import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../types/bowling";

const deleteSession = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/bowlingRepository", () => ({ deleteSession: (id: number) => deleteSession(id) }));

const SUMMARY = {
  session: { id: 7, date: "2026-10-17", alley_name: "Pinecrest Lanes" },
  games: [
    { id: 1, session_id: 7, game_number: 1, final_score: 190, frames: [] },
    { id: 2, session_id: 7, game_number: 2, final_score: 210, frames: [] }
  ]
} as unknown as SessionSummary;

// One list for the life of the test, as the live query's is between changes:
// the view resets its window whenever the list is a new one.
const FILTERS = { sessionList: [SUMMARY], history: [SUMMARY], isLoading: false, error: null };
vi.mock("./useSessionFilters", () => ({ useSessionFilters: () => FILTERS }));
vi.mock("../components/SessionFilterBar", () => ({
  SessionFilterButton: () => null,
  SessionFilterChips: () => null,
  SessionFilterSheet: () => null
}));

const { HistoryView } = await import("./HistoryView");

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PointerEventStandIn extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.assign(window, { PointerEvent: PointerEventStandIn });
  }
  window.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

function swipeOpen() {
  const content = screen.getByRole("button", { name: /Open session/ }).parentElement!;
  fireEvent.pointerDown(content, { clientX: 300, clientY: 100, pointerId: 1 });
  for (let x = 280; x >= 160; x -= 20) fireEvent.pointerMove(content, { clientX: x, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(content, { pointerId: 1 });
}

describe("History's swipe to delete (ADR-233)", () => {
  beforeEach(() => deleteSession.mockClear());

  it("asks first, in the session editor's words, and deletes only on Delete", async () => {
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    swipeOpen();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteSession).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete this session?");
    expect(dialog).toHaveTextContent('"Pinecrest Lanes" and all 2 games will be permanently deleted.');
    // The dialog's Delete, after the row's own.
    const deletes = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deletes[deletes.length - 1]);
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledWith(7));
  });

  it("deletes nothing when the bowler cancels", async () => {
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    swipeOpen();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await new Promise((r) => setTimeout(r, 300));
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("offers no swipe on the session being scored", () => {
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={7} />);
    swipeOpen();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
