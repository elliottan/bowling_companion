import { describe, expect, it, vi } from "vitest";
import { applyNativeChrome, followThemeInSystemBars } from "./nativeChrome";

function page(content = "width=device-width, initial-scale=1.0, viewport-fit=cover") {
  const doc = document.implementation.createHTMLDocument("t");
  const meta = doc.createElement("meta");
  meta.name = "viewport";
  meta.content = content;
  doc.head.appendChild(meta);
  return { doc, meta };
}

describe("applyNativeChrome", () => {
  it("leaves the web app's zoom alone", () => {
    const { doc, meta } = page();
    expect(applyNativeChrome(doc, false)).toBe(false);
    expect(meta.content).not.toMatch(/user-scalable/);
  });

  it("turns pinch zoom off in the store apps, keeping the rest of the viewport", () => {
    const { doc, meta } = page();
    expect(applyNativeChrome(doc, true)).toBe(true);
    expect(meta.content).toBe("width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no");
  });

  it("does not stack the setting twice", () => {
    const { doc, meta } = page("width=device-width, user-scalable=no");
    expect(applyNativeChrome(doc, true)).toBe(false);
    expect(meta.content).toBe("width=device-width, user-scalable=no");
  });
});

describe("followThemeInSystemBars", () => {
  it("does nothing outside the Android app", () => {
    const setStyle = vi.fn(() => Promise.resolve());
    expect(followThemeInSystemBars(document, false, setStyle)).toBeNull();
    expect(setStyle).not.toHaveBeenCalled();
  });

  it("draws light icons on the dark theme and dark ones on the light, as the theme changes", async () => {
    const doc = document.implementation.createHTMLDocument("t");
    doc.documentElement.dataset.theme = "dark";
    const setStyle = vi.fn((_style: string) => Promise.resolve());
    const stop = followThemeInSystemBars(doc, true, setStyle);
    doc.documentElement.dataset.theme = "light";
    await new Promise((r) => setTimeout(r, 0));
    // A change to another attribute is not a change of theme.
    doc.documentElement.dataset.palette = "ocean";
    await new Promise((r) => setTimeout(r, 0));
    expect(setStyle.mock.calls.map(([s]) => s)).toEqual(["DARK", "LIGHT"]);
    stop?.();
  });
});
