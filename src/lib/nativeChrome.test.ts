import { describe, expect, it } from "vitest";
import { applyNativeChrome } from "./nativeChrome";

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
