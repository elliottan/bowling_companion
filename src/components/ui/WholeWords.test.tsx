import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WholeWords } from "./WholeWords";

describe("WholeWords", () => {
  it("sizes its type to the longest word against its own width, never larger than given", () => {
    render(<WholeWords text="Rencana main" className="block" />);
    const text = screen.getByText("Rencana main");
    // 7 letters at 0.6em, and 6% over.
    expect(text.style.fontSize).toMatch(/^min\(1em, 22\.47\d*cqi\)$/); // 100 / 4.45
    expect(text.parentElement!.parentElement).toHaveClass("[container-type:inline-size]");
  });

  it("caps the size inside the classed span, so the classes still set the size it starts from", () => {
    render(<WholeWords text="Stance" className="text-caption-2" />);
    const text = screen.getByText("Stance");
    // On the classed span, the inline size would override text-caption-2 and
    // draw the label at the body size.
    expect(text).not.toHaveClass("text-caption-2");
    expect(text.style.fontSize).toMatch(/^min\(1em/);
    expect(text.parentElement).toHaveClass("text-caption-2");
  });

  it("draws children in place of the text, and leaves an empty one at its size", () => {
    render(<WholeWords text="">{" "}</WholeWords>);
    expect(document.querySelector("[class*='container-type'] > span > span")!.getAttribute("style")).toBeNull();
  });
});
