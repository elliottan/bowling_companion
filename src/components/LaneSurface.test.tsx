import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LaneSurface } from "./LaneSurface";
import { PLANE_W, PLANE_L } from "../lib/laneGeometry";

describe("LaneSurface", () => {
  it("renders an SVG sized to the plane with 10 pins", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${PLANE_W} ${PLANE_L}`);
    expect(container.querySelectorAll('[data-role="pin"]').length).toBe(10);
  });

  it("draws the ball path when the line is drawable", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" />
    );
    expect(container.querySelector('[data-role="ball-path"]')).not.toBeNull();
  });

  it("omits the path when the line is not drawable", () => {
    const { container } = render(<LaneSurface line={{ target: 10 }} hand="right" />);
    expect(container.querySelector('[data-role="ball-path"]')).toBeNull();
  });

  it("lights the standing leave pins when given", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" leave={[10]} />
    );
    const lit = container.querySelectorAll('[data-role="pin"][data-standing="true"]');
    expect(lit.length).toBe(1);
  });

  it("animates a rolling ball along the path unless reduced-motion", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" animate />
    );
    const ball = container.querySelector('[data-role="ball"]');
    expect(ball).not.toBeNull();
    expect(ball!.querySelector("animateMotion")).not.toBeNull();
  });
});
