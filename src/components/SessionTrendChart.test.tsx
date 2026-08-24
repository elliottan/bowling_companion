import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionTrendChart } from "./SessionTrendChart";

const dots = (container: HTMLElement) => [...container.querySelectorAll("circle")];

describe("SessionTrendChart", () => {
  it("draws one line through the session averages, with a dot per game behind it", () => {
    const { container } = render(
      <SessionTrendChart
        sessions={[
          { sessionId: 190, date: "2026-08-01", alley: "Serangoon Bowl", average: 190, scores: [180, 200] },
          { sessionId: 210, date: "2026-08-08", alley: "Serangoon Bowl", average: 210, scores: [200, 220] }
        ]}
      />
    );
    expect(container.querySelectorAll("path")).toHaveLength(1);
    // Four games plus the two session averages.
    expect(dots(container)).toHaveLength(6);
  });

  it("drops a session with nothing scored rather than plotting it at zero", () => {
    const { container } = render(
      <SessionTrendChart
        sessions={[
          { sessionId: 190, date: "2026-08-01", alley: "Serangoon Bowl", average: 190, scores: [190] },
          { sessionId: 0, date: "2026-08-08", alley: "Serangoon Bowl", average: 0, scores: [] }
        ]}
      />
    );
    // One game dot and one average dot: the empty night is not on the chart.
    expect(dots(container)).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("2026-08-08");
  });

  it("names the night behind a tapped point, and opens it", () => {
    const opened: number[] = [];
    render(
      <SessionTrendChart
        sessions={[
          {
            sessionId: 7,
            date: "2026-08-05",
            alley: "Chinese Swimming Club",
            event: "SIA Bilateral",
            average: 207,
            scores: [191, 224, 206]
          }
        ]}
        onOpenSession={(id) => opened.push(id)}
      />
    );
    expect(screen.queryByText("Chinese Swimming Club")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /2026-08-05, Chinese Swimming Club/ }));
    expect(screen.getByText("Chinese Swimming Club")).toBeInTheDocument();
    expect(screen.getByText("SIA Bilateral · 3 games")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Chinese Swimming Club"));
    expect(opened).toEqual([7]);
  });

  it("drops the selection when the same point is tapped again", () => {
    render(
      <SessionTrendChart
        sessions={[
          { sessionId: 1, date: "2026-08-05", alley: "Orchid Bowl", average: 200, scores: [200] }
        ]}
      />
    );
    const hit = screen.getByRole("button", { name: /2026-08-05/ });
    fireEvent.click(hit);
    expect(screen.getByText("Orchid Bowl")).toBeInTheDocument();
    fireEvent.click(hit);
    expect(screen.queryByText("Orchid Bowl")).toBeNull();
  });

  it("draws a single session without a line", () => {
    const { container } = render(
      <SessionTrendChart sessions={[{ sessionId: 190, date: "2026-08-01", alley: "Serangoon Bowl", average: 190, scores: [190] }]} />
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("drops a selection the filters have removed rather than reading past the list", () => {
    const sessions = [
      { sessionId: 1, date: "2026-08-01", alley: "Orchid Bowl", average: 190, scores: [190] },
      { sessionId: 2, date: "2026-08-08", alley: "Serangoon Bowl", average: 210, scores: [210] }
    ];
    const { rerender } = render(<SessionTrendChart sessions={sessions} />);
    fireEvent.click(screen.getByRole("button", { name: /2026-08-08/ }));
    expect(screen.getByText("Serangoon Bowl")).toBeInTheDocument();

    // The location filter narrows the list under the chart.
    rerender(<SessionTrendChart sessions={[sessions[0]]} />);
    expect(screen.queryByText("Serangoon Bowl")).toBeNull();
    expect(screen.queryByText("Orchid Bowl")).toBeNull();
  });
});
