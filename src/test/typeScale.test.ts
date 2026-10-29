import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEXT_SCALE_DENSE_MAX, TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SIZES } from "../lib/textScale";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/**
 * Type is set from the scale in `tailwind.config.js` (ADR-219), so it follows
 * the phone's text size and the bowler's. A pixel size written as `text-[11px]`
 * does not, and iOS ignores it entirely. The pin numbers in `MiniPins` have
 * their own named sizes (`text-pin-xs`) for the same reason.
 */
describe("the type scale", () => {
  it("leaves no font size in pixels or rem written by hand", () => {
    const offenders = sources("src").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line: string, i: number) => ({ file, line: i + 1, text: line }))
        .filter(({ text }: { text: string }) => /text-\[\d*\.?\d+(px|rem)\]/.test(text))
        .map(({ file: f, line }: { file: string; line: number }) => `${f}:${line}`)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the stylesheet", () => {
  const css = readFileSync("src/index.css", "utf8");

  it("clamps to the same bounds as this file", () => {
    const m = css.match(/--text-scale:\s*clamp\(\s*([\d.]+)\s*,[^;]*,\s*([\d.]+)\s*\)/);
    expect(m, "the :root --text-scale clamp").not.toBeNull();
    expect(Number(m![1])).toBe(TEXT_SCALE_MIN);
    expect(Number(m![2])).toBe(TEXT_SCALE_MAX);
  });

  it("caps a dense surface at the same size as this file", () => {
    const m = css.match(/\.type-cap-dense\s*\{[^}]*min\(var\(--text-scale\),\s*([\d.]+)\)/);
    expect(m, ".type-cap-dense").not.toBeNull();
    expect(Number(m![1])).toBe(TEXT_SCALE_DENSE_MAX);
  });

  it("is told the same sizes by the pre-paint script as by this file", () => {
    const html = readFileSync("app/index.html", "utf8");
    const m = html.match(/var sizes = \{([^}]*)\}/);
    expect(m, "the pre-paint sizes").not.toBeNull();
    const parsed = Object.fromEntries(
      m![1].split(",").map((pair: string) => {
        const [k, v] = pair.split(":").map((x: string) => x.trim());
        return [k, Number(v)];
      })
    );
    const expected = Object.fromEntries(TEXT_SIZES.filter((s) => s.scale !== 1).map((s) => [s.id, s.scale]));
    expect(parsed).toEqual(expected);
  });
});

/**
 * The smallest text in the app is a grey label (`text-ink-tertiary`), and it
 * was 2.4:1 on white. Text under 18pt needs 4.5:1 (WCAG 1.4.3), so the two
 * tokens a label is set in are measured here against the surfaces it sits on.
 */
describe("the grey labels", () => {
  const css = readFileSync("src/index.css", "utf8");

  function tokens(selector: string): Record<string, number[]> {
    const start = css.indexOf(selector);
    const block = css.slice(start, css.indexOf("}", start));
    const out: Record<string, number[]> = {};
    const re = /--color-([\w-]+):\s*(\d+) (\d+) (\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
    return out;
  }

  const luminance = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const [theme, selector] of [
    ["light", ':root,\n:root[data-theme="light"] {'],
    ["dark", ':root[data-theme="dark"] {']
  ] as const) {
    it(`reach 4.5:1 on the page and the card in ${theme}`, () => {
      const t = tokens(selector);
      for (const ink of ["ink-secondary", "ink-tertiary"]) {
        for (const ground of ["surface", "surface-sunken"]) {
          expect(ratio(t[ink], t[ground]), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
