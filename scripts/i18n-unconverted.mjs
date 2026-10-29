// Counts the user-facing strings still written as plain English in each screen
// (ADR-220, docs/I18N.md), so a language can be planned and the conversion
// tracked. It is a heuristic, not a parser: it counts an attribute that is a
// string literal in a word-bearing prop, and a line of JSX text that starts with
// a capital. It over-counts a little (class names never match, but a prop that
// takes a code does) and misses strings built in a helper. Good enough to rank
// files; the extract (`npm run i18n:extract`) is the truth for what is marked.
//
//   node scripts/i18n-unconverted.mjs          the table, biggest first
//   node scripts/i18n-unconverted.mjs --json   the same as JSON
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PROPS = "label|title|aria-label|placeholder|description|message|heading|subtitle|confirmLabel|submitLabel|alt|emptyLabel";
const attr = new RegExp(`\\b(?:${PROPS})="[A-Za-z][^"]*"`, "g");
const text = /^\s*[A-Z][a-z]+[A-Za-z ,.'&!?-]*[a-z.!?]\s*$/;
const converted = /\bt`|\bmsg\(|\bplural\(|i18n\._\(/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const rows = [];
for (const file of walk("src")) {
  const lines = readFileSync(file, "utf8").split("\n");
  let plain = 0;
  let marked = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("{/*")) continue;
    if (converted.test(line)) marked += (line.match(/\bt`|\bmsg\(|\bplural\(/g) ?? []).length;
    plain += (line.match(attr) ?? []).length;
    if (text.test(line) && !/^\s*(import|export|const|return|case|if|else)\b/.test(line)) plain += 1;
  }
  if (plain || marked) rows.push({ file, plain, marked });
}
rows.sort((a, b) => b.plain - a.plain);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const total = rows.reduce((n, r) => n + r.plain, 0);
  const done = rows.reduce((n, r) => n + r.marked, 0);
  for (const r of rows.filter((r) => r.plain > 0)) console.log(`${String(r.plain).padStart(4)}  ${r.file}`);
  console.log(`\n${total} plain strings left in ${rows.filter((r) => r.plain > 0).length} files; ${done} messages marked.`);
}
