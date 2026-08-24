import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScoreTrendChart } from "./ScoreTrendChart";

function paths(container: HTMLElement): string[] {
  return [...container.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "");
}

describe("ScoreTrendChart", () => {
  it("draws one segment per adjacent pair of games", () => {
    const { container } = render(
      <ScoreTrendChart
        games={[
          { game_number: 1, final_score: 242 },
          { game_number: 2, final_score: 249 },
          { game_number: 3, final_score: 157 }
        ]}
      />
    );
    expect(paths(container)).toHaveLength(2);
  });

  it("breaks the line across an unscored game rather than bridging it", () => {
    const { container } = render(
      <ScoreTrendChart
        games={[
          { game_number: 1, final_score: 242 },
          { game_number: 2, final_score: undefined },
          { game_number: 3, final_score: 157 }
        ]}
      />
    );
    expect(paths(container)).toHaveLength(0);
  });

  it("draws a single game as a lone point with no line", () => {
    const { container } = render(
      <ScoreTrendChart games={[{ game_number: 1, final_score: 200 }]} />
    );
    expect(paths(container)).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("renders nothing when no game has been scored", () => {
    const { container } = render(
      <ScoreTrendChart games={[{ game_number: 1, final_score: undefined }]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the high game and the low game", () => {
    const { container } = render(
      <ScoreTrendChart
        games={[
          { game_number: 1, final_score: 242 },
          { game_number: 2, final_score: 157 }
        ]}
      />
    );
    const classes = [...container.querySelectorAll("circle")].map((c) => c.getAttribute("class"));
    expect(classes).toContain("fill-success-700");
    expect(classes).toContain("fill-danger-600");
  });

  it("names the game behind a tapped point, and opens it", () => {
    const opened: number[] = [];
    render(
      <ScoreTrendChart
        games={[
          { id: 11, game_number: 1, final_score: 191 },
          { id: 22, game_number: 2, final_score: 224 }
        ]}
        onOpenGame={(id) => opened.push(id)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Game 2, 224" }));
    expect(screen.getByText("Game 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Game 2"));
    expect(opened).toEqual([22]);
  });
});
