import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../types/bowling";
import { HistoryCalendar } from "./HistoryCalendar";

let nextId = 1;
function summary(date: string, scores: Array<number | undefined>): SessionSummary {
  const id = nextId++;
  return {
    session: { id, date, alley_name: "Ace Lanes" },
    games: scores.map((final_score, i) => ({ id: id * 100 + i, session_id: id, game_number: i + 1, final_score, frames: [] }))
  } as unknown as SessionSummary;
}

const OCTOBER = { year: 2026, month: 9 };
const SESSIONS = [summary("2026-10-21", [240]), summary("2026-10-19", [200]), summary("2026-10-03", [160])];

function renderCalendar(props: Partial<Parameters<typeof HistoryCalendar>[0]> = {}) {
  const onMonthChange = vi.fn();
  const onSelectDay = vi.fn();
  render(
    <HistoryCalendar
      sessions={SESSIONS}
      month={OCTOBER}
      onMonthChange={onMonthChange}
      selectedDay={null}
      onSelectDay={onSelectDay}
      weekStart={0}
      today={new Date(2026, 10, 8)}
      {...props}
    />
  );
  return { onMonthChange, onSelectDay };
}

describe("History's calendar (ADR-252)", () => {
  it("names the month and totals it", () => {
    renderCalendar();
    const card = screen.getByRole("region", { name: "October 2026" });
    expect(card).toHaveTextContent("3 sessions");
    expect(card).toHaveTextContent("200 avg");
  });

  it("shades the bowled days by their average among the days shown, with no legend", () => {
    renderCalendar();
    const best = screen.getByRole("button", { name: "Wednesday, October 21, average 240" });
    const worst = screen.getByRole("button", { name: "Saturday, October 3, average 160" });
    expect(best.className).toContain("bg-accent-fill ");
    expect(worst.className).toContain("bg-accent-fill/15");
    expect(screen.queryByText("220+")).toBeNull();
    // A day not bowled is not a button.
    expect(screen.queryByRole("button", { name: /October 10/ })).toBeNull();
  });

  it("re-ranks when the sessions shown narrow", () => {
    renderCalendar({ sessions: [SESSIONS[1], SESSIONS[2]] });
    // 200 was the middle; with 240 filtered away it is the month's best.
    expect(screen.getByRole("button", { name: /October 19/ }).className).toContain("bg-accent-fill ");
  });

  it("reports the day tapped", () => {
    const { onSelectDay } = renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: /October 19/ }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-10-19");
  });

  it("moves a month either way, and to the month picked", () => {
    const { onMonthChange } = renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month: 8 });
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month: 10 });

    const picker = screen.getByLabelText("Choose month");
    expect(picker).toHaveValue("2026-10");
    fireEvent.change(picker, { target: { value: "2025-03" } });
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2025, month: 2 });
  });

  it("stops at the first and last months with a session (ADR-255)", () => {
    const bounds = { min: { year: 2026, month: 5 }, max: OCTOBER };
    const { onMonthChange } = renderCalendar({ bounds });
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();

    const picker = screen.getByLabelText("Choose month");
    expect(picker).toHaveAttribute("min", "2026-06");
    expect(picker).toHaveAttribute("max", "2026-10");
    fireEvent.change(picker, { target: { value: "2025-03" } });
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month: 5 });
  });

  it("marks a day still being bowled without an average", () => {
    renderCalendar({ sessions: [summary("2026-10-28", [undefined])] });
    const day = screen.getByRole("button", { name: "Wednesday, October 28" });
    expect(within(day).getByText("28")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "October 2026" })).not.toHaveTextContent("avg");
  });
});
