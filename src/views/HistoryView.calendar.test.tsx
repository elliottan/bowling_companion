import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../types/bowling";

const deleteSession = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/bowlingRepository", () => ({ deleteSession: (id: number) => deleteSession(id) }));

const day = (id: number, date: string, score: number) =>
  ({
    session: { id, date, alley_name: "Pinecrest Lanes" },
    games: [{ id: id * 10, session_id: id, game_number: 1, final_score: score, frames: [] }]
  }) as unknown as SessionSummary;
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const LIST = [day(9, `${thisMonth}-02`, 214), day(8, `${thisMonth}-02`, 190), day(7, `${thisMonth}-01`, 180)];

// One list for the life of the test, as the live query's is between changes:
// the view resets its window whenever the list is a new one.
const FILTERS = { sessionList: LIST, history: LIST, isLoading: false, error: null };
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

describe("History's calendar and day headings (ADR-252)", () => {
  afterEach(() => localStorage.clear());

  it("opens with the calendar, under a leading switch that hides it and remembers", () => {
    const { unmount } = render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    const toggle = screen.getByRole("button", { name: "Calendar" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull();
    unmount();

    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "false");
  });

  it("lists sessions under one heading per day, and the rows drop the date", () => {
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    const days = document.querySelectorAll("section[data-day]");
    expect([...days].map((d) => d.getAttribute("data-day"))).toEqual([`${thisMonth}-02`, `${thisMonth}-01`]);
    expect(days[0].querySelectorAll("li")).toHaveLength(2);
    const row = screen.getAllByRole("button", { name: /Open session/ })[0];
    expect(row).not.toHaveTextContent(String(now.getFullYear()));
  });

  it("takes the list to a day tapped on the calendar", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} />);
    const first = screen.getAllByRole("button").find((b) => /, average 180$/.test(b.getAttribute("aria-label") ?? ""))!;
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(scrollTo).toHaveBeenCalled();
  });

  it("is not on the pushed History", () => {
    render(<HistoryView mode="push" onBack={vi.fn()} onOpenSession={vi.fn()} activeSessionId={null} />);
    expect(screen.queryByRole("button", { name: "Calendar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull();
  });
});
