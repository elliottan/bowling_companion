// Fails when the catalogs in src/locales are out of step with the strings in
// the source (ADR-220): a string was marked, changed or removed and nobody ran
// `npm run i18n:extract`. It runs the extract itself and compares, so it does
// not depend on what git has staged, and it leaves the freshly extracted files
// in place so the fix is to commit them.
//
// Then it fails on any message a language has no translation for. Lingui would
// quietly show the English there, so a new string would drift a translated
// screen back into English one release at a time, and nothing would say so.
// The fix is the `translate-strings` skill (.claude/skills), which fills the
// gaps for every language at once.
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
const sourceLocale = "en";
const untranslated = [];
for (const locale of readdirSync(dir)) {
  const file = join(dir, locale, "messages.po");
  if (locale === sourceLocale || !existsSync(file)) continue;
  const missing = missingTranslations(readFileSync(file, "utf8"));
  if (missing.length) untranslated.push({ locale, missing });
}
if (untranslated.length) {
  console.error("\nSome messages have no translation, so those screens would show English:");
  for (const { locale, missing } of untranslated) {
    console.error(`  ${locale}: ${missing.length}`);
    for (const id of missing.slice(0, 5)) console.error(`    ${id}`);
    if (missing.length > 5) console.error(`    and ${missing.length - 5} more`);
  }
  console.error("Translate them with the translate-strings skill (.claude/skills/translate-strings).");
  process.exit(1);
}
console.log("The catalogs match the source, and every language translates every message.");

/** The msgids of a .po file's entries whose msgstr is empty, the header aside. */
function missingTranslations(po) {
  const missing = [];
  for (const entry of po.split(/\n\s*\n/)) {
    const id = entry.match(/^msgid "(.*)"$/m)?.[1];
    if (!id) continue;
    const lines = entry.split("\n");
    const at = lines.findIndex((l) => l.startsWith("msgstr "));
    if (at < 0) continue;
    const continued = lines[at + 1]?.startsWith('"');
    if (lines[at] === 'msgstr ""' && !continued) missing.push(id);
  }
  return missing;
}
