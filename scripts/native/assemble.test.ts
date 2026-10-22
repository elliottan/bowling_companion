import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { appShellHtml, assemble, keepInApp } from "./assemble";

const SHELL = `<html><head>
    <link rel="manifest" href="/manifest.webmanifest">
    <script defer src="/_vercel/insights/script.js"></script>
    <script type="module" src="/assets/app.js"></script>
  </head></html>`;

describe("keepInApp", () => {
  it("carries the code, the icons, the legal page and the catalog snapshot", () => {
    for (const path of [
      "assets/app-1.js",
      "icons/icon-192.png",
      "help/line-panel-light.png",
      "legal/index.html",
      "catalog/catalog.json",
      "catalog/catalog-manifest.json",
      "catalog/patterns.json",
      "favicon.ico"
    ]) {
      expect(keepInApp(path), path).toBe(true);
    }
  });

  it("leaves out the photos and sheets, which load from headpin.app (ADR-154)", () => {
    expect(keepInApp("catalog/img/a-thumb.webp")).toBe(false);
    expect(keepInApp("catalog/sheets/a.pdf")).toBe(false);
  });

  it("leaves out what only the website uses", () => {
    for (const path of [
      "index.html",
      "app/index.html",
      "404.html",
      "guides/spare-system/index.html",
      "shots/scorer.webp",
      "sw.js",
      "workbox-ca0fd4ca.js",
      "manifest.webmanifest",
      "og-image.png",
      "robots.txt",
      "sitemap.xml"
    ]) {
      expect(keepInApp(path), path).toBe(false);
    }
  });
});

describe("appShellHtml", () => {
  it("takes out the page analytics and the install manifest, and keeps the app", () => {
    const html = appShellHtml(SHELL);
    expect(html).not.toContain("_vercel");
    expect(html).not.toContain("manifest");
    expect(html).toContain('<script type="module" src="/assets/app.js"></script>');
  });

  it("refuses a shell whose analytics tag has moved, rather than shipping it", () => {
    expect(() => appShellHtml("<html></html>")).toThrow(/Vercel analytics/);
  });
});

describe("assemble", () => {
  it("puts the shell at the root and copies only what the app carries", () => {
    const root = mkdtempSync(join(tmpdir(), "headpin-native-"));
    const dist = join(root, "dist");
    const out = join(root, "dist-native");
    const put = (path: string, body = "x") => {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), body);
    };
    put("index.html", "landing");
    put("app/index.html", SHELL);
    put("assets/app.js");
    put("catalog/catalog.json");
    put("catalog/img/a-thumb.webp");
    // A stale file from the last run must not survive into this one.
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "stale.txt"), "old");

    const { files } = assemble(dist, out);

    expect(files).toBe(3);
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("/assets/app.js");
    expect(existsSync(join(out, "assets/app.js"))).toBe(true);
    expect(existsSync(join(out, "catalog/catalog.json"))).toBe(true);
    expect(existsSync(join(out, "catalog/img"))).toBe(false);
    expect(existsSync(join(out, "app"))).toBe(false);
    expect(existsSync(join(out, "stale.txt"))).toBe(false);
  });
});
