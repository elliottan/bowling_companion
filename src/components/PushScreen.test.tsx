import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { overlayHandoff, PUSH_IN_MS } from "../lib/overlayHandoff";
import { PushScreen } from "./PushScreen";

const panelOf = () => screen.getByRole("dialog", { name: "Spare lines" }).querySelector(".bg-surface-sunken") as HTMLElement;

describe("PushScreen taking a loading screen's place", () => {
  afterEach(() => {
    overlayHandoff.active = false;
    vi.restoreAllMocks();
  });

  it("slides in on its own when nothing stood in for it", () => {
    render(<PushScreen title="Spare lines" onBack={() => {}}>body</PushScreen>);
    expect(panelOf()).toHaveClass("animate-push-in");
    expect(panelOf().style.animationDelay).toBe("");
  });

  it("carries the loading screen's slide on from where it had got to", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    Object.assign(overlayHandoff, { active: true, since: 1000 - 40 });
    render(<PushScreen title="Spare lines" onBack={() => {}}>body</PushScreen>);
    // The first open used to arrive with no slide at all, standing where the
    // loading screen had barely begun to move.
    expect(panelOf()).toHaveClass("animate-push-in");
    expect(panelOf().style.animationDelay).toBe("-40ms");
  });

  it("does not slide again once the loading screen's slide has finished", () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    Object.assign(overlayHandoff, { active: true, since: 5000 - PUSH_IN_MS - 100 });
    render(<PushScreen title="Spare lines" onBack={() => {}}>body</PushScreen>);
    expect(panelOf()).not.toHaveClass("animate-push-in");
  });
});
