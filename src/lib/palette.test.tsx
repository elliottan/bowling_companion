import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PALETTES, applyPalette, readPalette, useAppliedPalette } from "./palette";

function Applied({ proOpen }: { proOpen: boolean }) {
  useAppliedPalette(proOpen);
  return null;
}

describe("palette (ADR-164)", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it("is Felt unless a known color was chosen", () => {
    expect(readPalette()).toBe("felt");
    localStorage.setItem("palette", "ocean");
    expect(readPalette()).toBe("ocean");
    localStorage.setItem("palette", "nonsense");
    expect(readPalette()).toBe("felt");
  });

  it("puts a color on the page, and Felt is none", () => {
    applyPalette("grape");
    expect(document.documentElement.dataset.palette).toBe("grape");
    applyPalette("felt");
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });

  it("keeps a Pro color only while Pro is open, without forgetting it", () => {
    localStorage.setItem("palette", "rose");
    const { rerender } = render(<Applied proOpen={true} />);
    expect(document.documentElement.dataset.palette).toBe("rose");

    rerender(<Applied proOpen={false} />);
    expect(document.documentElement.dataset.palette).toBeUndefined();
    expect(localStorage.getItem("palette")).toBe("rose");

    rerender(<Applied proOpen={true} />);
    expect(document.documentElement.dataset.palette).toBe("rose");
  });

  it("adds four Pro colors to the one everybody has", () => {
    expect(PALETTES.filter((p) => !p.pro).map((p) => p.id)).toEqual(["felt"]);
    expect(PALETTES.filter((p) => p.pro)).toHaveLength(4);
  });
});
