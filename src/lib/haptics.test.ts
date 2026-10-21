import { afterEach, describe, expect, it, vi } from "vitest";

const impact = vi.fn(() => Promise.resolve());
const notification = vi.fn(() => Promise.resolve());
const selection: string[] = [];
const selectionStart = vi.fn(() => (selection.push("start"), Promise.resolve()));
const selectionChanged = vi.fn(() => (selection.push("changed"), Promise.resolve()));
const selectionEnd = vi.fn(() => (selection.push("end"), Promise.resolve()));

vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact, notification, selectionStart, selectionChanged, selectionEnd },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" },
  NotificationType: { Success: "SUCCESS" }
}));

const { haptic } = await import("./haptics");

describe("haptic", () => {
  afterEach(() => {
    impact.mockClear();
    notification.mockClear();
  });

  it("stays silent on the web and loads nothing", async () => {
    await haptic("mark", false);
    expect(impact).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it("taps lightly for a pin and firmly for a shot", async () => {
    await haptic("pin", true);
    await haptic("shot", true);
    expect(impact.mock.calls).toEqual([[{ style: "LIGHT" }], [{ style: "MEDIUM" }]]);
  });

  it("marks a strike or spare as a success", async () => {
    await haptic("mark", true);
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("ticks a selection inside one start and end", async () => {
    await haptic("select", true);
    expect(selection).toEqual(["start", "changed", "end"]);
    expect(impact).not.toHaveBeenCalled();
  });

  it("shrugs off a phone that cannot give one", async () => {
    impact.mockImplementationOnce(() => Promise.reject(new Error("unavailable")));
    await expect(haptic("pin", true)).resolves.toBeUndefined();
  });
});
