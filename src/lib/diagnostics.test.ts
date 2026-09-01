import { describe, expect, it, vi } from "vitest";
import { formatDiagnostics, type Diagnostics } from "./diagnostics";

const sample: Diagnostics = {
  version: "0.1.0",
  built: "2026-09-02T10:00Z",
  install: "installed",
  storage: "persistent",
  screen: "390x844 @3x",
  browser: "Mozilla/5.0 (iPhone)",
  counts: { sessions: 4, games: 12 }
};

describe("formatDiagnostics", () => {
  it("names the build and the data volume in plain text", () => {
    const text = formatDiagnostics(sample);
    expect(text).toContain("version: 0.1.0 (built 2026-09-02T10:00Z)");
    expect(text).toContain("install: installed");
    expect(text).toContain("sessions=4 games=12");
  });

  it("carries no scores, alleys or anything else identifying", () => {
    expect(formatDiagnostics(sample)).not.toMatch(/alley|score|name/i);
  });
});

describe("collectDiagnostics", () => {
  it("reports the browser tab when nothing claims standalone", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }) as MediaQueryList);
    const { collectDiagnostics } = await import("./diagnostics");
    const d = await collectDiagnostics();
    expect(d.install).toBe("browser tab");
    vi.unstubAllGlobals();
  });
});

describe("feedbackMailto", () => {
  it("addresses the mail and carries the diagnostics in its body", async () => {
    const { feedbackMailto } = await import("./links");
    const url = feedbackMailto(formatDiagnostics(sample));
    expect(url.startsWith("mailto:hello@headpin.app?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("version: 0.1.0");
  });
});
