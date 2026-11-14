import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShotTracerView } from "./ShotTracerView";

describe("ShotTracerView", () => {
  it("opens on recording or choosing a video", () => {
    render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Record a shot/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute("capture")).toBe("environment");
    expect(inputs[1].accept).toBe("video/*");
  });
});
