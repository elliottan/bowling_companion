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
  it("keeps its card and picker when no point has a value, and plots nothing", () => {
    // A 300 has no spare chance, so its spare rate is null. The card used to go
    // with its picker, and a remembered pick then hid the chart for good.
    plot(slots([null, null]), { header: <button type="button">Spare %</button> });
    expect(screen.getByRole("button", { name: "Spare %" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to chart yet")).toBeInTheDocument();
    expect(chart()).toBeNull();
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

  it("can name every point of a short axis past the default", () => {
    plot(slots(Array.from({ length: 12 }, (_, i) => 50 + i)), { labelAllUpTo: 12 });
    const axisLabels = [...chart().querySelectorAll("text")]
      .map((t) => t.textContent)
      .filter((t) => t?.startsWith("G"));
    expect(axisLabels).toHaveLength(12);
  });

  it("fits every point in the card's width rather than scrolling (ADR-145)", () => {
    plot(slots([70, 60, 45, 30, 25, 20, 15, 10]));
    expect(chart().getAttribute("viewBox")).toBe("0 0 320 140");
    expect(chart().style.width).toBe("");
    expect(chart().closest(".overflow-x-auto")).toBeNull();
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
