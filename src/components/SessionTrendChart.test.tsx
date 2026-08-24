import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionTrendChart } from "./SessionTrendChart";

const dots = (container: HTMLElement) => [...container.querySelectorAll("circle")];

describe("SessionTrendChart", () => {
  it("draws one line through the session averages, with a dot per game behind it", () => {
    const { container } = render(
      <SessionTrendChart
        sessions={[
          { date: "2026-08-01", average: 190, scores: [180, 200] },
          { date: "2026-08-08", average: 210, scores: [200, 220] }
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
          { date: "2026-08-01", average: 190, scores: [190] },
          { date: "2026-08-08", average: 0, scores: [] }
        ]}
      />
    );
    // One game dot and one average dot: the empty night is not on the chart.
    expect(dots(container)).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("2026-08-08");
  });

  it("draws a single session without a line", () => {
    const { container } = render(
      <SessionTrendChart sessions={[{ date: "2026-08-01", average: 190, scores: [190] }]} />
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});
