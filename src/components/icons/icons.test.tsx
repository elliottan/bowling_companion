import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./index";

const GLYPHS = Object.entries(icons).filter(([name]) => name.endsWith("Icon"));

/**
 * The app's own glyphs have to be interchangeable with Lucide's: same grid,
 * same stroke, same props, and hidden from a screen reader by default, because
 * every one of them sits beside a label that already says the word.
 */
describe("the custom icon set", () => {
  it("has one for each bowling idea the app names", () => {
    expect(GLYPHS.map(([name]) => name).sort()).toEqual([
      "BowlingBallIcon",
      "GamePlanIcon",
      "LanePairIcon",
      "LaneViewIcon",
      "OilPatternIcon",
      "PinIcon",
      "RackIcon",
      "SpareLineIcon"
    ]);
  });

  it.each(GLYPHS)("%s draws on Lucide's grid and takes its props", (_name, Icon) => {
    const { container } = render(<Icon size={20} aria-hidden="true" className="text-accent" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toBe("text-accent");
  });

  it.each(GLYPHS)("%s stays inside the 24x24 box", (_name, Icon) => {
    const { container } = render(<Icon />);
    const shapes = container.querySelectorAll("path, circle, rect, line");
    expect(shapes.length).toBeGreaterThan(0);

    // Nothing is drawn off the canvas, which is what makes a glyph line up
    // beside a Lucide one at any size. Read off the shapes only: the <svg> tag
    // carries the xmlns, whose year is not a coordinate.
    for (const shape of shapes) {
      for (const attr of shape.attributes) {
        for (const n of attr.value.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(Math.abs(Number(n))).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});
