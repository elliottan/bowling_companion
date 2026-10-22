import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A sideways scroller stops dead at its ends (DESIGN-LANGUAGE 4d).
 *
 * `overscroll-x-contain` was not enough: it stops the swipe reaching the page,
 * but iOS still rubber-bands the scroller itself, and on the Balls card that
 * dragged the pinned ball names off the left edge with the columns. Only
 * `none` drops the bounce. Read from source, like the copy sweep, so a screen
 * no test mounts is still covered. Walked by hand: CI's Node has no globSync.
 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("sideways scrollers", () => {
  it("never bounce past their ends", () => {
    const offenders = sourcesUnder("src").flatMap((file) =>
      (readFileSync(file, "utf8").match(/className=["{`][^\n]*/g) ?? [])
        .filter((cls) => /\boverflow-(x-)?(auto|scroll)\b/.test(cls))
        .filter((cls) => !/\boverscroll-(x-)?none\b/.test(cls))
        .map((cls) => `${file}: ${cls.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it("draw no scroll bar, since their cut-off edge already says they scroll (ADR-196)", () => {
    const offenders = sourcesUnder("src").flatMap((file) =>
      (readFileSync(file, "utf8").match(/className=["{`][^\n]*/g) ?? [])
        .filter((cls) => /\boverflow-(x-)?(auto|scroll)\b/.test(cls))
        .filter((cls) => !/\bscrollbar-none\b/.test(cls))
        .map((cls) => `${file}: ${cls.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
