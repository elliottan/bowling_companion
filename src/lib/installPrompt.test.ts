import { describe, expect, it } from "vitest";
import { isIOSSafari, isStandalone } from "./installPrompt";

describe("isIOSSafari", () => {
  it("detects iPhone Safari UA", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5
    };
    expect(isIOSSafari(nav)).toBe(true);
  });

  it("detects iPad spoofed-desktop UA via maxTouchPoints", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5
    };
    expect(isIOSSafari(nav)).toBe(true);
  });

  it("returns false for a real desktop Mac (no touch points)", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 0
    };
    expect(isIOSSafari(nav)).toBe(false);
  });

  it("returns false for Android Chrome UA", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
      maxTouchPoints: 5
    };
    expect(isIOSSafari(nav)).toBe(false);
  });

  it("returns false for desktop Chrome UA", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      maxTouchPoints: 0
    };
    expect(isIOSSafari(nav)).toBe(false);
  });
});

describe("isStandalone", () => {
  it("returns true when display-mode: standalone matches", () => {
    const win = { matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }) as MediaQueryList };
    const nav = {};
    expect(isStandalone(win, nav)).toBe(true);
  });

  it("returns true when navigator.standalone is true (iOS legacy)", () => {
    const win = { matchMedia: () => ({ matches: false }) as MediaQueryList };
    const nav = { standalone: true };
    expect(isStandalone(win, nav)).toBe(true);
  });

  it("returns false when neither signal is present", () => {
    const win = { matchMedia: () => ({ matches: false }) as MediaQueryList };
    const nav = { standalone: false };
    expect(isStandalone(win, nav)).toBe(false);
  });
});
