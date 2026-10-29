// Fails when the catalogs in src/locales are out of step with the strings in
// the source (ADR-220): a string was marked, changed or removed and nobody ran
// `npm run i18n:extract`. It runs the extract itself and compares, so it does
// not depend on what git has staged, and it leaves the freshly extracted files
// in place so the fix is to commit them.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "src/locales";

function snapshot() {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const locale of readdirSync(dir)) {
    const file = join(dir, locale, "messages.po");
    if (existsSync(file)) out[file] = readFileSync(file, "utf8");
  }
  return out;
}

const before = snapshot();
execFileSync("npx", ["lingui", "extract", "--clean"], { stdio: "inherit" });
const after = snapshot();

const stale = Object.keys({ ...before, ...after }).filter((f) => before[f] !== after[f]);
if (stale.length) {
  console.error(
    `\nThe catalogs were out of date: ${stale.join(", ")}.\n` +
      "They have been re-extracted. Review and commit them (npm run i18n:extract)."
  );
  process.exit(1);
}
console.log("The catalogs match the source.");
