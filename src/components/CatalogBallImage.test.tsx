import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogBallImage } from "./CatalogBallImage";

const props = {
  src: "https://example.test/pitch-black.png",
  alt: "Storm Pitch Black",
  brand: "Storm" as const,
  size: "thumb" as const
};

describe("CatalogBallImage", () => {
  it("fades in on the first load, then paints opaque on remount", () => {
    // The shot panel remounts on every shot change. Before this, `loaded` reset
    // to false each time and the brand placeholder flashed for a picture the
    // browser already held.
    const first = render(<CatalogBallImage {...props} />);
    const img = screen.getByAltText(props.alt);

    expect(img.className).toContain("opacity-0");
    expect(img.className).toContain("duration-300");

    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");

    first.unmount();
    render(<CatalogBallImage {...props} />);
    const remounted = screen.getByAltText(props.alt);

    expect(remounted.className).toContain("opacity-100");
    expect(remounted.className).not.toContain("opacity-0");
    // No fade to replay either — it was never transparent.
    expect(remounted.className).toContain("duration-0");
  });

  it("keeps a never-loaded source transparent", () => {
    render(<CatalogBallImage {...props} src="https://example.test/other.png" />);
    expect(screen.getByAltText(props.alt).className).toContain("opacity-0");
  });
});
