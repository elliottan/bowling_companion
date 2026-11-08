import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WholeWords } from "./WholeWords";

describe("WholeWords", () => {
  it("sizes its type to the longest word against its own width, never larger than given", () => {
    render(<WholeWords text="Rencana main" className="block" />);
    const text = screen.getByText("Rencana main");
    // 7 letters at 0.6em, and 6% over.
    expect(text.style.fontSize).toMatch(/^min\(1em, 22\.47\d*cqi\)$/); // 100 / 4.45
    expect(text.parentElement).toHaveClass("[container-type:inline-size]");
  });

  it("draws children in place of the text, and leaves an empty one at its size", () => {
    render(<WholeWords text="">{" "}</WholeWords>);
    expect(document.querySelector("[class*='container-type'] > span")!.getAttribute("style")).toBeNull();
  });
});
