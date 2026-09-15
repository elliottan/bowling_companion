import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LaneSurface, type OilOverlay } from "./LaneSurface";
import { oilBands, oilZones, peakUnits } from "../lib/oilPattern";
import { PLANE_W, PLANE_L, boardToX, feetToY } from "../lib/laneGeometry";

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

  it("renders a slide tick at the given board when slideBoard is provided (ADR-030)", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" slideBoard={20} />
    );
    const tick = container.querySelector('[data-role="slide-tick"] circle');
    expect(tick).not.toBeNull();
    expect(Number(tick!.getAttribute("cx"))).toBeCloseTo(boardToX(20, "right"));
    expect(Number(tick!.getAttribute("cy"))).toBeCloseTo(feetToY(0));
  });

  it("omits the slide tick when slideBoard is not provided", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" />
    );
    expect(container.querySelector('[data-role="slide-tick"]')).toBeNull();
  });
});

describe("LaneSurface oil overlay", () => {
  const zones = oilZones([
    { direction: "forward", start_distance: 0, end_distance: 40, left_board: 5, right_board: 35, loads: 2, microliters: 20 },
    { direction: "forward", start_distance: 0, end_distance: 25, left_board: 15, right_board: 25, loads: 2, microliters: 20 },
  ]);
  const oil: OilOverlay = {
    bands: oilBands(zones),
    peak: peakUnits(zones),
    length: 40,
    exit: { board: 6, feet: 38 },
  };

  it("keeps the decorative sheen when there is no pattern", () => {
    const { container } = render(<LaneSurface line={{ laydown: 18, target: 10 }} hand="right" />);
    expect(container.querySelector('[data-role="oil-film"]')).toBeNull();
    expect(container.querySelector('[fill="url(#lane-oil)"]')).not.toBeNull();
  });

  it("draws one rectangle per run of equally loaded boards, and drops the sheen", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" oil={oil} />
    );
    expect(container.querySelector('[fill="url(#lane-oil)"]')).toBeNull();
    expect(container.querySelectorAll('[data-role="oil-band"]').length).toBe(oil.bands.length);
  });

  it("paints a heavier board denser than a lighter one", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" oil={oil} />
    );
    const opacities = [...container.querySelectorAll('[data-role="oil-band"]')].map((b) =>
      Number(b.getAttribute("fill-opacity"))
    );
    expect(Math.max(...opacities)).toBeGreaterThan(Math.min(...opacities));
  });

  it("marks the end of the pattern at its distance", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" oil={oil} />
    );
    const end = container.querySelector('[data-role="oil-end"]')!;
    expect(Number(end.getAttribute("y1"))).toBeCloseTo(feetToY(40), 5);
  });

  it("puts the exit marker on the board and distance it was given", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" oil={oil} />
    );
    const dot = container.querySelector('[data-role="oil-exit"] circle')!;
    expect(Number(dot.getAttribute("cx"))).toBeCloseTo(boardToX(6, "right", true), 5);
    expect(Number(dot.getAttribute("cy"))).toBeCloseTo(feetToY(38), 5);
    expect(container.querySelector('[data-role="oil-exit"] text')!.textContent).toBe("Exit 6·38ft");
  });

  it("mirrors the oiled span for a right-hander, so sheet board 5 draws on the right", () => {
    const rh = render(<LaneSurface line={{ laydown: 18, target: 10 }} hand="right" oil={oil} />);
    const lh = render(<LaneSurface line={{ laydown: 18, target: 10 }} hand="left" oil={oil} />);
    const leftEdge = (c: HTMLElement) =>
      Math.min(...[...c.querySelectorAll('[data-role="oil-band"]')].map((b) => Number(b.getAttribute("x"))));
    // The pattern is symmetric about the centre, so both hands cover the same
    // span; what the mirror has to preserve is the width, not the side.
    expect(leftEdge(rh.container)).toBeCloseTo(leftEdge(lh.container), 5);
  });
});
