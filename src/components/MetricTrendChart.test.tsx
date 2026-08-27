import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MetricTrendChart, type MetricPoint } from "./MetricTrendChart";

const RATE = { format: (v: number) => `${v}%`, min: 0, max: 100, minSpan: 25 };

function slots(values: Array<number | null>): MetricPoint[] {
  return values.map((value, i) => ({
    key: `n${i + 1}`,
    axis: `G${i + 1}`,
    title: `Game ${i + 1}`,
    detail: "8 games",
    value
  }));
}

function plot(points: MetricPoint[], extra: Record<string, unknown> = {}) {
  return render(<MetricTrendChart points={points} overall={null} {...RATE} {...extra} />);
}

/** The SVG the chart draws, whatever wraps it. */
function chart(): SVGSVGElement {
  return document.querySelector("svg") as SVGSVGElement;
}

describe("MetricTrendChart", () => {
  it("draws nothing when no point has a value", () => {
    const { container } = plot(slots([null, null]));
    expect(container).toBeEmptyDOMElement();
  });

  it("names each point by its title and value", () => {
    plot(slots([70, 60, 45]));
    expect(screen.getByRole("button", { name: "Game 1, 70%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game 3, 45%" })).toBeInTheDocument();
  });

  it("says a point has no value rather than calling it zero", () => {
    plot(slots([70, null, 45]));
    expect(screen.getByRole("button", { name: "Game 2, no value" })).toBeInTheDocument();
  });

  it("breaks the line at a gap instead of bridging it", () => {
    const { container } = render(
      <MetricTrendChart points={slots([70, 60, null, 40, 30])} overall={null} {...RATE} />
    );
    // Two runs of points, so two paths.
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("labels every point while there are few of them", () => {
    plot(slots([70, 60, 45, 30]));
    const axisLabels = [...chart().querySelectorAll("text")]
      .map((t) => t.textContent)
      .filter((t) => t?.startsWith("G"));
    expect(axisLabels).toEqual(["G1", "G2", "G3", "G4"]);
  });

  it("labels only the ends once there are many", () => {
    plot(slots(Array.from({ length: 12 }, (_, i) => 50 + i)));
    const axisLabels = [...chart().querySelectorAll("text")]
      .map((t) => t.textContent)
      .filter((t) => t?.startsWith("G"));
    expect(axisLabels).toEqual(["G1", "G12"]);
  });

  it("prints one high and one low, even when the extremes tie", () => {
    // Two 100s and two 40s: one label each, not four.
    plot(slots([100, 40, 100, 40]));
    const printed = [...chart().querySelectorAll("text")]
      .map((t) => t.textContent)
      .filter((t) => t === "100%" || t === "40%");
    expect(printed).toEqual(["100%", "40%"]);
  });

  it("prints nothing when every point is the same", () => {
    plot(slots([60, 60, 60]));
    const printed = [...chart().querySelectorAll("text")].map((t) => t.textContent);
    expect(printed.filter((t) => t === "60%")).toEqual([]);
  });

  describe("the scrolling window", () => {
    it("keeps the plot at its natural width inside the window", () => {
      plot(slots([70, 60, 45, 30]), { windowSize: 4 });
      expect(chart().getAttribute("viewBox")).toBe("0 0 320 140");
      expect(chart().style.width).toBe("");
    });

    it("widens the plot past the window rather than bunching the points", () => {
      plot(slots([70, 60, 45, 30, 25, 20]), { windowSize: 4 });
      // Six points in a window of four: half as wide again.
      expect(chart().getAttribute("viewBox")).toBe("0 0 480 140");
      expect(chart().style.width).toBe("150%");
    });

    it("widens the viewBox in step, so the labels do not scale with it", () => {
      plot(slots([70, 60, 45, 30, 25, 20, 15, 10]), { windowSize: 4 });
      const [, , width] = (chart().getAttribute("viewBox") as string).split(" ").map(Number);
      const rendered = Number(chart().style.width.replace("%", ""));
      // One user unit stays one pixel: 2x the units at 2x the width.
      expect(width / 320).toBeCloseTo(rendered / 100, 5);
    });

    it("does not scroll at all without a window", () => {
      plot(slots([70, 60, 45, 30, 25, 20]));
      expect(chart().getAttribute("viewBox")).toBe("0 0 320 140");
    });
  });

  it("opens the point behind the selection", () => {
    const onOpen = vi.fn();
    plot(slots([70, 60, 45]), { onOpen });

    fireEvent.click(screen.getByRole("button", { name: "Game 2, 60%" }));
    fireEvent.click(screen.getByRole("button", { name: /^Game 2 / }));
    expect(onOpen).toHaveBeenCalledWith("n2");
  });

  it("closes the selection when the same point is tapped again", () => {
    plot(slots([70, 60, 45]));
    fireEvent.click(screen.getByRole("button", { name: "Game 2, 60%" }));
    expect(screen.getByRole("button", { name: /^Game 2 / })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Game 2, 60%" }));
    expect(screen.queryByRole("button", { name: /^Game 2 8 games/ })).toBeNull();
  });
});
