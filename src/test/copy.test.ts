import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The regression guard for the copy sweep.
 *
 * Every rule below was a real string in the app, and every one of them would
 * come back the next time a screen is written in a hurry. A test is the only
 * thing that keeps a vocabulary decision from decaying, because nothing else
 * in the build has an opinion about the word "night".
 *
 * It reads source rather than rendered output on purpose: a rendered check
 * would only cover the screens a test happens to mount.
 */

/**
 * Walked by hand rather than globbed. `fs.globSync` landed in Node 22 and CI
 * pins Node 20, so the sweep threw "globSync is not a function" there and
 * passed on every machine that ran it locally: the one failure mode a
 * regression guard must not have.
 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const SOURCES = sourcesUnder("src").filter(
  (f) => !f.includes(".test.") && !f.includes("/test/")
);

/** Comments are prose for the next maintainer, and "night" is the right word
 *  in them. Only what the app says out loud is linted. */
function codeWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The strings a bowler can read: quoted literals and JSX text. */
function userFacingText(source: string): string {
  const code = codeWithoutComments(source);
  const quoted = code.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];
  const jsxText = code.match(/>[^<>{}]+</g) ?? [];
  return [...quoted, ...jsxText].join("\n");
}

const RULES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /—/, why: 'an em dash. Use a comma, a colon, or a full stop.' },
  { pattern: /\bnights?\b/i, why: 'the word "night". An outing is a session.' },
  { pattern: /\blocations?\b/i, why: 'the word "location". A place you bowl is an alley.' },
  { pattern: /\bhouses?\b/i, why: 'the word "house" outside a bowling phrase. Say alley.' },
  { pattern: /\b(colour|grey|centre|organis(e|ation)|recognis|behaviour|catalogue|favourite|licence)/i, why: "UK spelling. The app writes US English." },
  { pattern: /\bBkpt\b/, why: '"Bkpt". The word is Break.' },
  // `...x` is a spread, which a template literal can carry into a string.
  { pattern: /\.\.\.(?![A-Za-z_$[{])/, why: "three dots. The ellipsis character is …" }
];

/** The maintained docs follow the same rule. DECISIONS and CHANGELOG are
 *  records of what was written at the time and are exempt (docs/README.md). */
const MAINTAINED_DOCS = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/DEPLOYMENT.md",
  "docs/DESIGN-LANGUAGE.md",
  "docs/ROADMAP.md"
];

describe("the maintained docs", () => {
  it("carry no em dash either", () => {
    const offenders = MAINTAINED_DOCS.filter((doc) => readFileSync(doc, "utf8").includes("\u2014"));
    expect(offenders).toEqual([]);
  });
});

describe("the words the app says", () => {
  it.each(RULES)("never contains $why", ({ pattern, why }) => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const line of userFacingText(readFileSync(file, "utf8")).split("\n")) {
        if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, `Found ${why}`).toEqual([]);
  });

  it("never puts an exclamation mark in a sentence the app says", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const code = codeWithoutComments(readFileSync(file, "utf8"));
      for (const text of code.match(/>[^<>{}]*!\s*</g) ?? []) {
        offenders.push(`${file}: ${text.trim()}`);
      }
    }
    expect(offenders, "DESIGN-LANGUAGE §8: the app never shouts").toEqual([]);
  });
});
