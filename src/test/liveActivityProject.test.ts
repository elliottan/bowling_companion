import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLiveActivityState } from "../lib/liveActivity";
import { PALETTES } from "../lib/palette";
import type { Frame } from "../types/bowling";

/**
 * The Live Activity (ADR-221) is Swift that this repository cannot compile, and
 * a project file edited by hand. These hold the parts that fail silently on a
 * phone: a field the page sends and the phone does not read, an extension that
 * is built but not embedded, or one whose version differs from the app's
 * (App Store Connect rejects the upload).
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const project = read("ios/App/App.xcodeproj/project.pbxproj");
const attributes = read("ios/App/Shared/HeadpinGameAttributes.swift");
const appPlist = read("ios/App/App/Info.plist");
const extensionPlist = read("ios/App/HeadpinLiveActivity/Info.plist");
const scene = read("ios/App/App/SceneDelegate.swift");

/** The body of a `{ ... }` block that starts at `opener`. */
function block(source: string, opener: string): string {
  const start = source.indexOf(opener);
  expect(start, opener).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}" && --depth === 0) return source.slice(source.indexOf("{", start) + 1, i);
  }
  throw new Error(`no end to ${opener}`);
}

/** The `var` names declared directly in a block, not those of a nested type. */
function fields(body: string): string[] {
  const nested = /struct \w+[^{]*\{/g;
  let flat = body;
  for (let m = nested.exec(body); m; m = nested.exec(body)) {
    flat = flat.replace(block(body, m[0]), "");
  }
  return [...flat.matchAll(/^\s*var (\w+)\s*:/gm)].map((m) => m[1]);
}

describe("the Live Activity's Swift matches the page", () => {
  const frames: Frame[] = [
    { game_id: 1, frame_number: 1, shots: [{ pins_standing: [] }], is_strike: true, is_spare: false }
  ];
  const state = buildLiveActivityState({ alley_name: "Sunset", description: "League" }, { game_number: 1 }, frames)!;
  const contentState = block(attributes, "struct ContentState");

  it("reads every field the page sends, and only those", () => {
    expect(fields(contentState).sort()).toEqual(Object.keys(state).sort());
  });

  it("reads each frame's marks and score", () => {
    expect(fields(block(contentState, "struct Frame")).sort()).toEqual(Object.keys(state.frames[0]).sort());
  });

  it("reads the optional max as optional, since the page sends null once the game is over", () => {
    expect(contentState).toMatch(/var max: Int\?/);
  });
});

describe("the widget extension in the Xcode project", () => {
  it("is a WidgetKit extension", () => {
    expect(extensionPlist).toContain("<string>com.apple.widgetkit-extension</string>");
    expect(project).toContain('productType = "com.apple.product-type.app-extension"');
  });

  it("is signed by the app's team, under the app's bundle id", () => {
    const teams = new Set([...project.matchAll(/DEVELOPMENT_TEAM = (\w+);/g)].map((m) => m[1]));
    expect(teams.size).toBe(1);
    const ids = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([\w.]+);/g)].map((m) => m[1]);
    expect(ids).toContain("app.headpin");
    expect(ids).toContain("app.headpin.LiveActivity");
    // Every id is the app's, or inside it: an extension outside it cannot embed.
    for (const id of ids) expect(id === "app.headpin" || id.startsWith("app.headpin.")).toBe(true);
  });

  it("carries the app's version and build number, which the store checks", () => {
    const versions = new Set([...project.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((m) => m[1]));
    const builds = new Set([...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]));
    expect(versions.size).toBe(1);
    expect(builds.size).toBe(1);
  });

  it("deploys to 16.1, the first iOS with Live Activities, while the app stays on 15", () => {
    expect(project).toMatch(/IPHONEOS_DEPLOYMENT_TARGET = 16\.1;/);
    expect(project.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/g)).toHaveLength(4);
  });

  it("is embedded in the app and built before it", () => {
    expect(project).toContain("name = \"Embed Foundation Extensions\"");
    expect(project).toContain("HeadpinLiveActivity.appex in Embed Foundation Extensions");
    expect(project).toMatch(/isa = PBXTargetDependency;\s+target = \w+ \/\* HeadpinLiveActivity \*\//);
  });

  it("compiles the shared attributes into both targets", () => {
    const uses = project.match(/HeadpinGameAttributes\.swift in Sources \*\/,/g);
    expect(uses).toHaveLength(2);
  });

  it("links the frameworks it draws with, and the app only weakly links ActivityKit", () => {
    for (const framework of ["WidgetKit", "SwiftUI", "ActivityKit"]) {
      expect(project).toContain(`${framework}.framework in Frameworks`);
    }
    expect(project).toMatch(/ActivityKit\.framework in Frameworks \*\/ = \{[^}]*ATTRIBUTES = \(Weak, \)/);
  });
});

describe("the app side", () => {
  it("says it supports Live Activities", () => {
    expect(appPlist).toMatch(/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  });

  it("registers the plugin the page loads by name", () => {
    expect(scene).toContain("registerPluginInstance(HeadpinLiveActivityPlugin())");
    expect(read("ios/App/App/HeadpinLiveActivityPlugin.swift")).toContain('jsName = "HeadpinLiveActivity"');
    expect(read("src/lib/nativeLiveActivity.ts")).toContain('registerPlugin<LiveActivityPlugin>("HeadpinLiveActivity")');
    expect(project).toContain("HeadpinLiveActivityPlugin.swift in Sources");
  });
});

describe("the Live Activity's palettes match the page's", () => {
  const css = read("src/index.css");
  const theme = read("ios/App/HeadpinLiveActivity/HeadpinTheme.swift");

  /** A token's "r g b" from the CSS block for this theme and palette. */
  function token(mode: "light" | "dark", palette: string, name: string): string {
    const selector =
      palette === "felt"
        ? mode === "light"
          ? ':root[data-theme="light"] {'
          : ':root[data-theme="dark"] {'
        : `:root[data-theme="${mode}"][data-palette="${palette}"] {`;
    const body = block(css, selector);
    const match = new RegExp(`--color-${name}:\\s*(\\d+ \\d+ \\d+)`).exec(body);
    expect(match, `${mode} ${palette} ${name}`).not.toBeNull();
    return match![1];
  }

  /** The same token as the Swift table writes it. */
  function swift(mode: "light" | "dark", palette: string, name: "accent" | "soft" | "fill"): string {
    const start = theme.indexOf(`static let ${mode}: [String: AccentTokens] = [`);
    expect(start, mode).toBeGreaterThan(-1);
    const table = theme.slice(start, theme.indexOf("\n    ]", start));
    const row = table.split("\n").find((line) => line.trim().startsWith(`"${palette}":`));
    expect(row, `${mode} ${palette}`).toBeDefined();
    const value = new RegExp(`${name}: \\((\\d+), (\\d+), (\\d+)\\)`).exec(row!);
    expect(value, `${mode} ${palette} ${name}`).not.toBeNull();
    return value!.slice(1).join(" ");
  }

  for (const { id } of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      it(`has ${id} in ${mode} as the page draws it`, () => {
        expect(swift(mode, id, "accent")).toBe(token(mode, id, "accent"));
        expect(swift(mode, id, "soft")).toBe(token(mode, id, "accent-soft"));
        expect(swift(mode, id, "fill")).toBe(token(mode, id, "accent-fill"));
      });
    }
  }
});
